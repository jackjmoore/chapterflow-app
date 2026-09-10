import { randomUUID } from 'crypto'
import type { StatusDef, TagDef } from '../../../shared/binder'

/**
 * Scrivener's per-document metadata, mapped onto ChapterFlow's two fields.
 *
 * Scrivener has four kinds — Label (one, coloured), Status (one, named),
 * Keywords (many), and Custom Metadata (typed) — and this app has two:
 * `statusId` (one) and `tagIds` (many). Label and Status therefore compete for
 * the same field, and Status wins it, because Scrivener's Status *is* a
 * workflow state in the same sense as this app's — To Do, First Draft, Done —
 * whereas a Label is an arbitrary colour whose meaning the writer decides,
 * which is what a tag is.
 *
 * Custom metadata is deliberately not mapped anywhere. See SPEC-scrivener-import.md.
 */

export interface ScrivLabelDef {
  id: string
  name: string
  /** Hex, converted from Scrivener's floating-point triple. */
  color: string
}

export interface ScrivStatusDef {
  id: string
  name: string
}

export interface ScrivMetadataSettings {
  labels: ScrivLabelDef[]
  statuses: ScrivStatusDef[]
  /** Section type id -> name, from <TypeDefinitions>. */
  sectionTypes: Map<string, string>
  /** Field names only. Read so the import report can be honest about how many
   *  were dropped; the values are never touched. */
  customFieldNames: string[]
}

/** Scrivener's "no label" and "no status" sentinel. */
const NONE_ID = '-1'

/**
 * Scrivener writes colours as three space-separated floats
 * ("0.993500 0.701213 0.732586"); this app wants hex.
 */
export function scrivColorToHex(triple: string): string {
  const parts = triple
    .trim()
    .split(/\s+/)
    .map((n) => Number.parseFloat(n))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return '#8a8a8a'
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(parts[0])}${channel(parts[1])}${channel(parts[2])}`
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/**
 * Reads the project-level definitions from the .scrivx.
 *
 * Regex rather than a full parse, and deliberately: these blocks are flat
 * lists of leaf elements, the shapes were confirmed against a real project,
 * and the alternative is threading a second XML pass through scrivxToTree for
 * four small lookups. Anything unrecognised is simply absent, which every
 * caller already tolerates.
 */
export function readMetadataSettings(xml: string): ScrivMetadataSettings {
  const labels: ScrivLabelDef[] = []
  const labelBlock = /<LabelSettings>([\s\S]*?)<\/LabelSettings>/.exec(xml)?.[1] ?? ''
  for (const m of labelBlock.matchAll(/<Label\b([^>]*)>([\s\S]*?)<\/Label>/g)) {
    const id = /\bID\s*=\s*"([^"]*)"/.exec(m[1])?.[1] ?? ''
    if (!id || id === NONE_ID) continue
    const color = /\bColor\s*=\s*"([^"]*)"/.exec(m[1])?.[1] ?? ''
    labels.push({ id, name: decodeXmlText(m[2]).trim(), color: scrivColorToHex(color) })
  }

  const statuses: ScrivStatusDef[] = []
  const statusBlock = /<StatusSettings>([\s\S]*?)<\/StatusSettings>/.exec(xml)?.[1] ?? ''
  for (const m of statusBlock.matchAll(/<Status\b([^>]*)>([\s\S]*?)<\/Status>/g)) {
    const id = /\bID\s*=\s*"([^"]*)"/.exec(m[1])?.[1] ?? ''
    if (!id || id === NONE_ID) continue
    statuses.push({ id, name: decodeXmlText(m[2]).trim() })
  }

  const sectionTypes = new Map<string, string>()
  const typeBlock = /<TypeDefinitions>([\s\S]*?)<\/TypeDefinitions>/.exec(xml)?.[1] ?? ''
  for (const m of typeBlock.matchAll(/<Type\b([^>]*)>([\s\S]*?)<\/Type>/g)) {
    const id = /\bID\s*=\s*"([^"]*)"/.exec(m[1])?.[1] ?? ''
    if (id) sectionTypes.set(id, decodeXmlText(m[2]).trim())
  }

  const customFieldNames: string[] = []
  const customBlock = /<CustomMetaDataSettings>([\s\S]*?)<\/CustomMetaDataSettings>/.exec(xml)?.[1] ?? ''
  for (const m of customBlock.matchAll(/<Title>([\s\S]*?)<\/Title>/g)) {
    customFieldNames.push(decodeXmlText(m[1]).trim())
  }

  return { labels, statuses, sectionTypes, customFieldNames }
}

export interface MappedPalettes {
  statuses: StatusDef[]
  tags: TagDef[]
  /** Scrivener StatusID -> StatusDef.id. "-1" is absent, not mapped to a
   *  status named "No Status". */
  statusById: Map<string, string>
  /** Scrivener LabelID -> TagDef.id. "-1" is absent. */
  tagByLabelId: Map<string, string>
  /** Keyword title (lower-cased) -> TagDef.id. */
  tagByKeyword: Map<string, string>
}

/**
 * Colours for keywords, which Scrivener gives none.
 *
 * A fixed rotation rather than something generated per import, so two imports
 * of the same project produce the same palette and a keyword does not change
 * colour because it was imported on a different day.
 */
const KEYWORD_COLORS = ['#6f95b8', '#7a9b6e', '#d9a441', '#b07aa8', '#c26a5a', '#5aa8a0']

/**
 * Builds the palettes an import writes with setStatuses/setTags.
 *
 * Both of those replace the whole list, which is safe here only because an
 * import creates a new project — there is nothing of the writer's to merge
 * with or clobber.
 */
export function mapPalettes(settings: ScrivMetadataSettings, keywords: string[]): MappedPalettes {
  const statuses: StatusDef[] = []
  const statusById = new Map<string, string>()
  for (const status of settings.statuses) {
    if (!status.name) continue
    const def: StatusDef = {
      id: `scriv-status-${status.id}`,
      name: status.name,
      // Scrivener statuses carry no colour of their own; this app's status
      // badges need one, so they take the neutral grey its own default
      // "Draft" status uses.
      color: '#8a8a8a'
    }
    statuses.push(def)
    statusById.set(status.id, def.id)
  }

  const tags: TagDef[] = []
  const byName = new Map<string, TagDef>()
  const addTag = (name: string, color: string): TagDef => {
    const key = name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) return existing
    const def: TagDef = { id: randomUUID(), name: name.trim(), color }
    byName.set(key, def)
    tags.push(def)
    return def
  }

  const tagByLabelId = new Map<string, string>()
  for (const label of settings.labels) {
    if (!label.name) continue
    tagByLabelId.set(label.id, addTag(label.name, label.color).id)
  }

  const tagByKeyword = new Map<string, string>()
  let next = 0
  for (const keyword of keywords) {
    const name = keyword.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (tagByKeyword.has(key)) continue
    // A keyword whose name already matches a label reuses that tag rather than
    // producing two chips that read identically — and takes no colour from the
    // rotation, so the next genuinely new keyword still gets a fresh one.
    const reused = byName.has(key)
    const def = addTag(name, KEYWORD_COLORS[next % KEYWORD_COLORS.length])
    if (!reused) next++
    tagByKeyword.set(key, def.id)
  }

  return { statuses, tags, statusById, tagByLabelId, tagByKeyword }
}

/**
 * Whether a folder should become a Part for the book compile preset.
 *
 * Only the explicitly-set section type is read. Scrivener resolves the other
 * ~97% from structural defaults (<LevelTypes>/<Folders>/<Containers>/<Files>),
 * and reimplementing that inheritance is out of scope — binder depth already
 * carries the structure this app needs.
 */
export function isPartSectionType(
  sectionTypeId: string | null,
  sectionTypes: Map<string, string>
): boolean {
  if (!sectionTypeId) return false
  const name = sectionTypes.get(sectionTypeId)
  return name !== undefined && name.trim().toLowerCase() === 'heading'
}
