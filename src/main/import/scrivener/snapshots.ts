import type { ProjectSource } from './projectSource'

/**
 * Scrivener's snapshots — a document's saved earlier versions.
 *
 * The layout, confirmed against a real project rather than guessed:
 *
 *     Snapshots/
 *       <documentUUID>.snapshots/          a directory, despite the extension
 *         index.xml                        titles, dates, style ids
 *         2026-09-06-19-44-13+0100.rtf     the content, named by its date
 *
 * Two details that matter. The RTF filename encodes the same timestamp the
 * index records, so an entry is matched to its file by deriving the name from
 * the date rather than by trusting document order. And <StyleIDs> is the same
 * comma-separated list as a document's content.styles — snapshot RTF carries
 * the same <$Scr_Ps::N> markers, so it needs the same style resolution or
 * every snapshot of a chapter opens with "<$Scr_Ps::0>".
 */

export interface ScrivSnapshot {
  /** ISO 8601, converted from Scrivener's "2026-09-06 19:44:13 +0100". */
  timestamp: string
  /** null when Scrivener's own placeholder title was never replaced. */
  title: string | null
  /** Path within the project of the snapshot's RTF. */
  contentPath: string
  /** Comma-separated style ids, in the shape resolveStyleNames expects. */
  styleIds: string | null
}

/** Scrivener's placeholder for a snapshot the writer never named. */
const UNTITLED = 'untitled snapshot'

export function snapshotsDirFor(uuid: string): string {
  return `Snapshots/${uuid}.snapshots`
}

/**
 * "2026-09-06 19:44:13 +0100" -> "2026-09-06T18:44:13.000Z".
 *
 * Returns null rather than a wrong date: importSnapshot refuses an unreadable
 * timestamp, and inventing one here would defeat that.
 */
export function parseScrivenerDate(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}):?(\d{2})$/.exec(raw.trim())
  if (!m) {
    const loose = new Date(raw)
    return Number.isNaN(loose.getTime()) ? null : loose.toISOString()
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}:${m[8]}`
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** The content filename Scrivener writes for a given index date. */
export function contentFileNameFor(rawDate: string): string {
  return `${rawDate.trim().replace(' ', '-').replace(/:/g, '-').replace(/ (?=[+-])/, '')}.rtf`
}

/**
 * Reads one document's snapshots, newest last (the order Scrivener writes).
 *
 * A document with no snapshots is the overwhelmingly common case and returns
 * an empty list rather than an error.
 */
export async function readSnapshots(
  source: ProjectSource,
  uuid: string,
  files: string[]
): Promise<ScrivSnapshot[]> {
  const dir = snapshotsDirFor(uuid)
  const indexPath = `${dir}/index.xml`
  if (!(await source.exists(indexPath))) return []

  let xml: string
  try {
    xml = await source.readText(indexPath)
  } catch {
    return []
  }

  const inDir = new Set(files.filter((f) => f.startsWith(`${dir}/`) && f.toLowerCase().endsWith('.rtf')))
  const out: ScrivSnapshot[] = []
  let position = 0

  for (const m of xml.matchAll(/<Snapshot>([\s\S]*?)<\/Snapshot>/g)) {
    const body = m[1]
    const rawDate = /<Date>([\s\S]*?)<\/Date>/.exec(body)?.[1]?.trim() ?? ''
    const rawTitle = /<Title>([\s\S]*?)<\/Title>/.exec(body)?.[1]?.trim() ?? ''
    const styleIds = /<StyleIDs>([\s\S]*?)<\/StyleIDs>/.exec(body)?.[1]?.trim() ?? ''
    position++

    const timestamp = parseScrivenerDate(rawDate)
    if (!timestamp) continue

    // Derived from the date, which is how Scrivener names them. Falling back
    // to positional order only if that file is absent, because a snapshot
    // matched to the wrong content is worse than one skipped.
    let contentPath = `${dir}/${contentFileNameFor(rawDate)}`
    if (!inDir.has(contentPath)) {
      const sorted = [...inDir].sort()
      const candidate = sorted[position - 1]
      if (!candidate) continue
      contentPath = candidate
    }

    out.push({
      timestamp,
      title: rawTitle && rawTitle.toLowerCase() !== UNTITLED ? rawTitle : null,
      contentPath,
      styleIds: styleIds || null
    })
  }

  return out
}
