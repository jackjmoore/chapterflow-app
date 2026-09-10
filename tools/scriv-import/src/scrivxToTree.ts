import { xml2js, type Element } from 'xml-js'

/**
 * The .scrivx binder manifest.
 *
 * Written against a real Scrivener 3 (Windows) project rather than inference.
 * What that project actually contains:
 *
 *   <ScrivenerProject Version="3.0" ...>
 *     <Binder>
 *       <BinderItem UUID="..." Type="DraftFolder" Created="..." Modified="...">
 *         <Title>Draft</Title>
 *         <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
 *         <Children>
 *           <BinderItem UUID="..." Type="Folder"> ... </BinderItem>
 *
 * Identity is the UUID attribute — never the title, which is neither unique
 * nor stable. Title is an element, not an attribute. Children nest inside an
 * explicit <Children> wrapper. Root Type values seen: DraftFolder,
 * ResearchFolder, TrashFolder, plus ordinary Folder and Text.
 *
 * xml-js in non-compact mode, matching how docxToBlocks reads OOXML, so the
 * app gains no new XML dependency when this moves in.
 */

export type ScrivKind = 'draft' | 'research' | 'trash' | 'folder' | 'text' | 'other'

export interface ScrivNode {
  uuid: string
  title: string
  /** The raw Type attribute, kept for diagnostics when kind is 'other'. */
  rawType: string
  kind: ScrivKind
  /** Scrivener's own compile flag. Not honoured by V1, but read so the
   *  importer can report on it rather than pretend it does not exist. */
  includeInCompile: boolean | null
  labelId: string | null
  statusId: string | null
  children: ScrivNode[]
}

export interface ScrivProject {
  title: string | null
  /** The binder's top level, in document order. */
  roots: ScrivNode[]
  /** Anything the walk could not make sense of, for the report. */
  problems: string[]
}

function elements(node: Element | undefined): Element[] {
  return (node?.elements ?? []) as Element[]
}

function childNamed(node: Element, name: string): Element | undefined {
  return elements(node).find((e) => e.name === name)
}

/** The text of a leaf element, xml-js style. */
function textOf(node: Element | undefined): string {
  if (!node) return ''
  return elements(node)
    .map((e) => (typeof e.text === 'string' ? e.text : typeof e.cdata === 'string' ? e.cdata : ''))
    .join('')
    .trim()
}

/**
 * Scrivener's fixed roots, mapped by Type.
 *
 * Only meaningful at the binder's top level — a nested folder is always an
 * ordinary folder whatever it is called.
 */
function kindOf(rawType: string): ScrivKind {
  switch (rawType) {
    case 'DraftFolder':
      return 'draft'
    case 'ResearchFolder':
      return 'research'
    case 'TrashFolder':
      return 'trash'
    case 'Folder':
      return 'folder'
    case 'Text':
      return 'text'
    default:
      return 'other'
  }
}

function yesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase()
  if (v === 'yes' || v === 'true' || v === '1') return true
  if (v === 'no' || v === 'false' || v === '0') return false
  return null
}

function readItem(element: Element, problems: string[]): ScrivNode | null {
  const attrs = (element.attributes ?? {}) as Record<string, string>
  // Both spellings are tolerated: the real project uses UUID, but the format
  // is unpublished and older projects are known to have used ID.
  const uuid = attrs.UUID ?? attrs.ID ?? ''
  if (!uuid) {
    problems.push('a BinderItem with no UUID or ID was skipped')
    return null
  }

  const rawType = attrs.Type ?? ''
  const metadata = childNamed(element, 'MetaData')
  const includeRaw = metadata ? textOf(childNamed(metadata, 'IncludeInCompile')) : ''

  const node: ScrivNode = {
    uuid,
    title: textOf(childNamed(element, 'Title')),
    rawType,
    kind: kindOf(rawType),
    includeInCompile: includeRaw ? yesNo(includeRaw) : null,
    labelId: metadata ? textOf(childNamed(metadata, 'LabelID')) || null : null,
    statusId: metadata ? textOf(childNamed(metadata, 'StatusID')) || null : null,
    children: []
  }

  const children = childNamed(element, 'Children')
  if (children) {
    for (const child of elements(children)) {
      if (child.name !== 'BinderItem') continue
      const parsed = readItem(child, problems)
      if (parsed) node.children.push(parsed)
    }
  }
  return node
}

export function scrivxToTree(xml: string): ScrivProject {
  const problems: string[] = []
  let root: Element
  try {
    root = xml2js(xml, { compact: false }) as Element
  } catch (error) {
    return { title: null, roots: [], problems: ['the .scrivx is not valid XML: ' + (error as Error).message] }
  }

  const project = elements(root).find((e) => e.name === 'ScrivenerProject')
  if (!project) {
    return { title: null, roots: [], problems: ['no <ScrivenerProject> element'] }
  }

  const binder = childNamed(project, 'Binder')
  if (!binder) {
    return { title: null, roots: [], problems: ['no <Binder> element'] }
  }

  const roots: ScrivNode[] = []
  for (const child of elements(binder)) {
    // A <BinderSeparator> sits between the fixed roots and carries nothing.
    if (child.name !== 'BinderItem') continue
    const parsed = readItem(child, problems)
    if (parsed) roots.push(parsed)
  }

  if (!roots.some((r) => r.kind === 'draft')) {
    problems.push('no DraftFolder at the binder root — the manuscript could not be identified')
  }

  const attrs = (project.attributes ?? {}) as Record<string, string>
  return { title: attrs.Title ?? null, roots, problems }
}

/** Every text item in the tree, in reading order. */
export function collectTextNodes(nodes: ScrivNode[], out: ScrivNode[] = []): ScrivNode[] {
  for (const node of nodes) {
    if (node.kind === 'text') out.push(node)
    collectTextNodes(node.children, out)
  }
  return out
}

/** Where a document's files live. Scrivener 3 only — version 2 used
 *  Files/Docs/<integer>.rtf and is refused rather than half-imported. */
export function documentPaths(uuid: string): {
  content: string
  styles: string
  synopsis: string
  notes: string
} {
  const base = `Files/Data/${uuid}`
  return {
    content: `${base}/content.rtf`,
    styles: `${base}/content.styles`,
    // Neither of these existed in the project surveyed, so they are looked up
    // and tolerated as absent rather than assumed present.
    synopsis: `${base}/synopsis.txt`,
    notes: `${base}/notes.rtf`
  }
}

/**
 * Scrivener's synopsis and notes, as plain text for the binder's own fields.
 *
 * Both are outliner metadata in Scrivener, written to disk only when the
 * writer has actually filled them in — which is why a project can legitimately
 * have none at all, and why absence is never an error here.
 *
 * notes.rtf carries formatting that DocumentNode.notes cannot hold, so it is
 * flattened to text. That loss is deliberate: making notes an HTML field would
 * need an editor to be worth having, and would blur the content/metadata line
 * this field exists to keep sharp.
 */
export function flattenToText(blocks: { runs: { text: string }[] }[]): string {
  return blocks
    .map((b) => b.runs.map((r) => r.text).join(''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
