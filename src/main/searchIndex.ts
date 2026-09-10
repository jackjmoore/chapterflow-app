import { readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative, sep } from 'path'
import { atomicWrite, setProjectWriteObserver } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import {
  tokenize,
  type SearchEntry,
  type SearchIndexStats,
  type SearchKind,
  type SearchMatch,
  type SearchQueryOptions
} from '../shared/search'

/**
 * A project-wide search index, built once and maintained incrementally.
 *
 * The point is that a query reads an already-current structure rather than
 * computing anything: no document is opened, parsed or scanned at query time.
 * That is deliberately a different mechanism from the project-wide find and
 * replace work, which made a live rescan cheap by memoising counts. This never
 * rescans at all.
 *
 * Currency comes from a single hook in atomicWrite rather than from every
 * feature notifying the index. Every store that persists project data already
 * writes through it, and it receives the content being written — so indexing
 * needs no re-read from disk, cannot race the write it is reacting to, and no
 * feature's code has to know the index exists.
 */

// ---------------------------------------------------------------- state

interface Fingerprint {
  mtimeMs: number
  size: number
}

interface IndexFile {
  version: 2
  /** Relative path -> stamp at the time it was indexed. Compared against the
   *  real files on load, because a project is a folder of plain files that a
   *  sync client, a backup restore, or a text editor can change behind us. */
  fingerprints: Record<string, Fingerprint>
  entries: SearchEntry[]
}

const entries = new Map<string, SearchEntry>()
/** token -> entry ids. Rebuilt from `entries` rather than persisted: cheap to
 *  recompute, and it cannot fall out of step with the entries it describes. */
const postings = new Map<string, Set<string>>()
/** Entry ids grouped by the source file that produced them, so re-indexing one
 *  source can drop exactly its own entries and nothing else. */
const bySource = new Map<string, Set<string>>()
const fingerprints = new Map<string, Fingerprint>()

/** Document and tag names live in binder.json, but are needed as display
 *  titles on entries produced from other files. Kept here so a rename does not
 *  force every chapter to be re-indexed. */
const documentNames = new Map<string, string>()
const tagNames = new Map<string, string>()

let ready = false
let reindexedSources = 0
/** Serialises index mutations; every write hook queues behind the last. */
let chain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

// ------------------------------------------------------- source mapping

/** Which file paths carry searchable content, and how to read them. Anything
 *  not listed here is ignored, so the index never reacts to preferences,
 *  sessions, sprints, backups or its own persisted file. */
type SourceKind =
  | 'document'
  | 'binder'
  | 'storyBibleIndex'
  | 'storyBibleSheet'
  | 'lexicon'
  | 'spanTags'
  | 'comments'
  | 'timeline'
  | 'relationships'
  | 'submissions'

interface SourceRef {
  kind: SourceKind
  /** Stable key for this source's entries — the relative path. */
  key: string
  /** Document / item id, for the per-file sources. */
  ownerId?: string
}

function classify(relativePath: string): SourceRef | null {
  const parts = relativePath.split(/[\\/]/)
  const key = parts.join('/')

  if (parts.length === 2 && parts[0] === 'documents' && parts[1].endsWith('.html')) {
    return { kind: 'document', key, ownerId: parts[1].replace(/\.html$/, '') }
  }
  if (parts.length === 3 && parts[0] === 'storybible' && parts[1] === 'sheets' && parts[2].endsWith('.json')) {
    return { kind: 'storyBibleSheet', key, ownerId: parts[2].replace(/\.json$/, '') }
  }
  if (parts.length === 2 && parts[0] === 'storybible' && parts[1] === 'index.json') {
    return { kind: 'storyBibleIndex', key }
  }
  if (parts.length === 1) {
    switch (parts[0]) {
      case 'binder.json':
        return { kind: 'binder', key }
      case 'lexicon.json':
        return { kind: 'lexicon', key }
      case 'spanTags.json':
        return { kind: 'spanTags', key }
      case 'comments.json':
        return { kind: 'comments', key }
      case 'timeline.json':
        return { kind: 'timeline', key }
      case 'relationships.json':
        return { kind: 'relationships', key }
      case 'submissions.json':
        return { kind: 'submissions', key }
      default:
        return null
    }
  }
  return null
}

// ------------------------------------------------------------- parsing

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function entry(
  kind: SearchKind,
  ownerId: string,
  field: string,
  title: string,
  text: string,
  documentId: string | null = null,
  updatedAt = 0
): SearchEntry | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return { id: `${kind}:${ownerId}:${field}`, kind, ownerId, documentId, field, title, text: trimmed, updatedAt }
}

/** Attaches a one-line descriptor, when there is one worth attaching. */
function withSubtitle(e: SearchEntry | null, subtitle: string): SearchEntry | null {
  if (e && subtitle.trim()) e.subtitle = subtitle.trim()
  return e
}

/** A record's own timestamp, in whatever shape its store happens to keep it:
 *  most use an ISO `updatedAt`, comments an epoch-ms `createdAt`. Zero means
 *  "this record carries no date of its own", and the source file's mtime is
 *  used in its place. */
function dateMs(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/** Builds every entry a source file contributes. Pure: takes the file's
 *  content, returns entries, touches no shared state. */
function parseSource(ref: SourceRef, content: string, sourceMtime: number): SearchEntry[] {
  const out: SearchEntry[] = []
  // Entries built from a record carrying its own date keep it; everything else
  // inherits the source file's mtime. Both are edit recency, which is all
  // ranking asks for — but the per-record date survives an unrelated edit to
  // the same file, so renaming one character does not restamp the other seven
  // as equally recent.
  const add = (e: SearchEntry | null): void => {
    if (!e) return
    if (!e.updatedAt) e.updatedAt = sourceMtime
    out.push(e)
  }

  switch (ref.kind) {
    case 'document': {
      const id = ref.ownerId as string
      add(entry('prose', id, 'body', documentNames.get(id) ?? id, stripHtml(content), id))
      // Footnote text is authored content that exists nowhere else — the same
      // argument that makes comment bodies worth indexing.
      const notes = [...content.matchAll(/data-footnote="([^"]*)"/g)].map((m) => m[1]).filter(Boolean)
      notes.forEach((note, i) =>
        add(entry('footnote', id, `note-${i}`, documentNames.get(id) ?? id, stripHtml(note), id))
      )
      break
    }

    case 'binder': {
      const file = safeJson<{
        tree?: unknown[]
        tags?: { id: string; name: string }[]
      }>(content)
      if (!file) break
      tagNames.clear()
      for (const tag of file.tags ?? []) tagNames.set(tag.id, tag.name)

      const walk = (nodes: unknown[]): void => {
        for (const raw of nodes) {
          const node = raw as {
            id: string
            type: string
            name: string
            synopsis?: string
            notes?: string
            children?: unknown[]
          }
          if (node.type === 'document') documentNames.set(node.id, node.name)
          add(entry('documentTitle', node.id, 'name', node.name, node.name, node.type === 'document' ? node.id : null))
          if (node.synopsis) {
            add(entry('documentTitle', node.id, 'synopsis', node.name, node.synopsis, node.id))
          }
          if (node.notes) {
            add(entry('documentTitle', node.id, 'notes', node.name, node.notes, node.id))
          }
          if (Array.isArray(node.children)) walk(node.children)
        }
      }
      walk(Array.isArray(file.tree) ? file.tree : [])
      break
    }

    case 'storyBibleIndex': {
      const file = safeJson<{
        items?: { id: string; typeId?: string; name: string; aliases?: string[]; summary?: string; updatedAt?: string }[]
        types?: { id: string; name: string }[]
      }>(content)
      const typeNames = new Map((file?.types ?? []).map((t) => [t.id, t.name]))
      for (const item of file?.items ?? []) {
        const at = dateMs(item.updatedAt)
        const descriptor = [typeNames.get(item.typeId ?? ''), item.summary].filter(Boolean).join(' · ')
        add(withSubtitle(entry('storyBibleName', item.id, 'name', item.name, item.name, null, at), descriptor))
        ;(item.aliases ?? []).forEach((alias, i) =>
          add(withSubtitle(entry('storyBibleAlias', item.id, `alias-${i}`, item.name, alias, null, at), descriptor))
        )
        if (item.summary) add(entry('storyBibleField', item.id, 'summary', item.name, item.summary, null, at))
      }
      break
    }

    case 'storyBibleSheet': {
      const itemId = ref.ownerId as string
      const file = safeJson<{ blocks?: Record<string, unknown>[] }>(content)
      const title = storyBibleNames.get(itemId) ?? itemId
      for (const block of file?.blocks ?? []) {
        const label = String(block.label ?? '')
        const id = String(block.id ?? '')
        if (block.kind === 'text') {
          add(entry('storyBibleField', itemId, `text-${id}`, title, `${label} ${stripHtml(String(block.html ?? ''))}`))
        } else if (block.kind === 'list') {
          const listItems = (block.items as string[] | undefined) ?? []
          add(entry('storyBibleField', itemId, `list-${id}`, title, `${label} ${listItems.join(' ')}`))
        } else if (block.kind === 'stats') {
          const pairs = (block.pairs as { label: string; value: string }[] | undefined) ?? []
          const flat = pairs.map((p) => `${p.label} ${p.value}`).join(' ')
          add(entry('storyBibleField', itemId, `stats-${id}`, title, `${label} ${flat}`))
        } else if (block.kind === 'image') {
          add(entry('storyBibleField', itemId, `image-${id}`, title, `${label} ${String(block.caption ?? '')}`))
        }
      }
      break
    }

    case 'lexicon': {
      const file = safeJson<{
        entries?: { id: string; word: string; meaning?: string; pronunciation?: string; updatedAt?: string }[]
      }>(content)
      for (const item of file?.entries ?? []) {
        const at = dateMs(item.updatedAt)
        add(withSubtitle(entry('lexicon', item.id, 'word', item.word, item.word, null, at), item.meaning ?? ''))
        if (item.meaning) add(entry('lexicon', item.id, 'meaning', item.word, item.meaning, null, at))
        if (item.pronunciation) {
          add(entry('lexicon', item.id, 'pronunciation', item.word, item.pronunciation, null, at))
        }
      }
      break
    }

    case 'spanTags': {
      const file = safeJson<{ spans?: { id: string; tagId: string; documentId: string; snippet: string }[] }>(content)
      for (const span of file?.spans ?? []) {
        const label = tagNames.get(span.tagId) ?? span.tagId
        // Both the tag's label and the text it is anchored to are searchable.
        add(entry('spanTag', span.id, 'snippet', label, `${label} ${span.snippet}`, span.documentId))
      }
      break
    }

    case 'comments': {
      const file = safeJson<{
        comments?: { id: string; documentId: string; body: string; snippet?: string; createdAt?: number }[]
      }>(content)
      for (const comment of file?.comments ?? []) {
        add(
          entry(
            'comment',
            comment.id,
            'body',
            comment.snippet ?? '',
            comment.body,
            comment.documentId,
            dateMs(comment.createdAt)
          )
        )
      }
      break
    }

    case 'timeline': {
      const file = safeJson<{
        entries?: {
          id: string
          description: string
          whenText?: string
          documentId: string | null
          updatedAt?: string
        }[]
      }>(content)
      for (const item of file?.entries ?? []) {
        add(
          entry(
            'timeline',
            item.id,
            'description',
            item.description,
            `${item.description} ${item.whenText ?? ''}`,
            item.documentId ?? null,
            dateMs(item.updatedAt)
          )
        )
      }
      break
    }

    case 'relationships': {
      const file = safeJson<{
        relationships?: { id: string; label: string; reverseLabel: string | null; updatedAt?: string }[]
      }>(content)
      for (const rel of file?.relationships ?? []) {
        add(
          entry(
            'relationship',
            rel.id,
            'label',
            rel.label,
            `${rel.label} ${rel.reverseLabel ?? ''}`,
            null,
            dateMs(rel.updatedAt)
          )
        )
      }
      break
    }

    case 'submissions': {
      const file = safeJson<{
        submissions?: { id: string; recipient: string; notes?: string; updatedAt?: string }[]
      }>(content)
      for (const sub of file?.submissions ?? []) {
        add(
          entry(
            'submission',
            sub.id,
            'record',
            sub.recipient,
            `${sub.recipient} ${sub.notes ?? ''}`,
            null,
            dateMs(sub.updatedAt)
          )
        )
      }
      break
    }
  }

  return out
}

/** Item names, for titling sheet entries. Populated when the Story Bible index
 *  is parsed; sheets are usually written after it. */
const storyBibleNames = new Map<string, string>()

// ---------------------------------------------------- index maintenance

function removeEntry(id: string): void {
  const existing = entries.get(id)
  if (!existing) return
  for (const token of new Set(tokenize(existing.text))) {
    const set = postings.get(token)
    if (!set) continue
    set.delete(id)
    if (set.size === 0) postings.delete(token)
  }
  entries.delete(id)
}

function addEntry(e: SearchEntry): void {
  removeEntry(e.id)
  entries.set(e.id, e)
  for (const token of new Set(tokenize(e.text))) {
    let set = postings.get(token)
    if (!set) {
      set = new Set<string>()
      postings.set(token, set)
    }
    set.add(e.id)
  }
}

/** Replaces everything one source contributed. Entries the source no longer
 *  produces are dropped, which is what makes deleting a comment or renaming an
 *  alias actually remove it from search. */
function applySource(ref: SourceRef, content: string, mtimeMs: number): void {
  if (ref.kind === 'storyBibleIndex') {
    const file = safeJson<{ items?: { id: string; name: string }[] }>(content)
    storyBibleNames.clear()
    for (const item of file?.items ?? []) storyBibleNames.set(item.id, item.name)
  }

  const produced = parseSource(ref, content, mtimeMs)
  const previous = bySource.get(ref.key) ?? new Set<string>()
  const nextIds = new Set(produced.map((e) => e.id))

  for (const id of previous) if (!nextIds.has(id)) removeEntry(id)
  for (const e of produced) addEntry(e)
  bySource.set(ref.key, nextIds)
  reindexedSources += 1

  // A rename in binder.json changes the display title of prose already
  // indexed. Cheaper to restamp those titles than to re-read every chapter.
  if (ref.kind === 'binder') {
    for (const e of entries.values()) {
      if ((e.kind === 'prose' || e.kind === 'footnote') && e.documentId) {
        const name = documentNames.get(e.documentId)
        if (name && name !== e.title) e.title = name
      }
    }
  }
}

function dropSource(key: string): void {
  for (const id of bySource.get(key) ?? []) removeEntry(id)
  bySource.delete(key)
  fingerprints.delete(key)
}

// ------------------------------------------------------------ scanning

/** Every searchable file currently in the project, as relative paths. */
async function listSources(root: string): Promise<string[]> {
  const found: string[] = []
  const consider = (relPath: string): void => {
    if (classify(relPath)) found.push(relPath.split(sep).join('/'))
  }

  for (const name of ['binder.json', 'storybible/index.json', 'lexicon.json', 'spanTags.json',
    'comments.json', 'timeline.json', 'relationships.json', 'submissions.json']) {
    if (existsSync(join(root, name))) consider(name)
  }
  for (const dir of ['documents', join('storybible', 'sheets')]) {
    const full = join(root, dir)
    if (!existsSync(full)) continue
    for (const name of await readdir(full)) {
      consider(relative(root, join(full, name)))
    }
  }
  return found
}

async function stamp(root: string, relPath: string): Promise<Fingerprint | null> {
  try {
    const info = await stat(join(root, relPath))
    return { mtimeMs: Math.round(info.mtimeMs), size: info.size }
  } catch {
    return null
  }
}

// ---------------------------------------------------------- persistence

function indexPath(): string {
  return join(getProjectRoot(), 'searchIndex.json')
}

async function persist(): Promise<void> {
  const file: IndexFile = {
    version: 2,
    fingerprints: Object.fromEntries(fingerprints),
    entries: [...entries.values()]
  }
  // Writes through atomicWrite like everything else; searchIndex.json is not a
  // classified source, so this cannot retrigger indexing.
  await atomicWrite(indexPath(), JSON.stringify(file))
}

/** Rebuilds postings and the source grouping from a loaded entry list. Cheap
 *  next to re-reading and re-parsing every file, which is the cost that
 *  persisting exists to avoid. */
function hydrate(loaded: SearchEntry[]): void {
  entries.clear()
  postings.clear()
  for (const e of loaded) addEntry(e)
}

// ------------------------------------------------------------- public

/**
 * Loads the index for the current project, validating it against the real
 * files and re-indexing only what disagrees. A missing or unreadable index
 * file is a full rebuild, never an error.
 */
export async function open(): Promise<void> {
  return runQueued(async () => {
    const root = getProjectRoot()
    entries.clear()
    postings.clear()
    bySource.clear()
    fingerprints.clear()
    documentNames.clear()
    tagNames.clear()
    storyBibleNames.clear()
    ready = false

    const stored = existsSync(indexPath()) ? safeJson<IndexFile>(await readFile(indexPath(), 'utf-8')) : null
    if (stored?.version === 2 && Array.isArray(stored.entries)) {
      hydrate(stored.entries)
      for (const [key, print] of Object.entries(stored.fingerprints ?? {})) fingerprints.set(key, print)
      // Rebuild the source grouping from the entries themselves is not
      // possible (an entry does not know its file), so it is recovered by
      // re-indexing any source whose fingerprint disagrees, below.
      for (const e of stored.entries) {
        const key = sourceKeyFor(e)
        if (!key) continue
        let set = bySource.get(key)
        if (!set) {
          set = new Set<string>()
          bySource.set(key, set)
        }
        set.add(e.id)
        if (e.kind === 'prose' && e.documentId) documentNames.set(e.documentId, e.title)
      }
    }

    const present = await listSources(root)
    const presentSet = new Set(present)

    // Sources that vanished while we weren't looking.
    for (const key of [...bySource.keys()]) if (!presentSet.has(key)) dropSource(key)

    // binder.json first: it supplies the display names and tag labels the
    // other parsers use, so indexing it later would leave stale titles.
    const ordered = present.sort((a, b) => rank(a) - rank(b))
    for (const relPath of ordered) {
      const print = await stamp(root, relPath)
      const known = fingerprints.get(relPath)
      if (print && known && known.mtimeMs === print.mtimeMs && known.size === print.size) continue
      const ref = classify(relPath)
      if (!ref || !print) continue
      applySource(ref, await readFile(join(root, relPath), 'utf-8'), print.mtimeMs)
      fingerprints.set(relPath, print)
    }

    ready = true
    await persist()
  })
}

/** binder.json, then the Story Bible index, then everything else. */
function rank(relPath: string): number {
  if (relPath === 'binder.json') return 0
  if (relPath === 'storybible/index.json') return 1
  return 2
}

/** Which source file an entry came from — used to rebuild the grouping after
 *  loading a persisted index. */
function sourceKeyFor(e: SearchEntry): string | null {
  switch (e.kind) {
    case 'prose':
    case 'footnote':
      return e.documentId ? `documents/${e.documentId}.html` : null
    case 'documentTitle':
      return 'binder.json'
    case 'storyBibleName':
    case 'storyBibleAlias':
      return 'storybible/index.json'
    case 'storyBibleField':
      // Summaries come from the index; block fields from the sheet.
      return e.field === 'summary' ? 'storybible/index.json' : `storybible/sheets/${e.ownerId}.json`
    case 'lexicon':
      return 'lexicon.json'
    case 'spanTag':
      return 'spanTags.json'
    case 'comment':
      return 'comments.json'
    case 'timeline':
      return 'timeline.json'
    case 'relationship':
      return 'relationships.json'
    case 'submission':
      return 'submissions.json'
    default:
      return null
  }
}

/**
 * Reacts to a project write. Registered with atomicWrite at startup, so no
 * store, IPC handler or feature knows the index exists.
 */
function onProjectWrite(filePath: string, data: string): void {
  // Held off during a bulk import — see suspend() at the foot of this file.
  if (suspended) return
  const root = getProjectRoot()
  const rel = relative(root, filePath)
  if (rel.startsWith('..')) return
  const ref = classify(rel)
  if (!ref) return

  // Caught rather than left as `void`: an exception here must never become
  // an unhandled rejection. It is reindexing reacting to a write that
  // already landed on disk successfully — a failure here means the index is
  // stale until the next write, not that anything the writer did failed.
  runQueued(async () => {
    // The write has just landed, so "now" is the file's mtime to within the
    // stat call that follows — and using it means indexing does not have to
    // wait on a stat first.
    applySource(ref, data, Date.now())
    const print = await stamp(root, rel)
    if (print) fingerprints.set(ref.key, print)
    await persist()
  }).catch((error) => console.error('Search index update failed:', error))
}

/** atomicWrite never sees a delete, so documentStore reports them here. */
export function onDocumentDeleted(documentId: string): void {
  runQueued(async () => {
    dropSource(`documents/${documentId}.html`)
    await persist()
  }).catch((error) => console.error('Search index update failed:', error))
}

/**
 * Every entry matching `text`.
 *
 * All query tokens must be present (AND). The raw query is then checked as a
 * contiguous substring, which sets `phrase` and yields offsets — so an exact
 * phrase and a scattered token match are distinguishable without this layer
 * deciding which is better. No ranking, no ordering beyond a stable one.
 */
export function query(text: string, options: SearchQueryOptions = {}): SearchMatch[] {
  const raw = text.trim()
  if (!raw) return []
  const queryTokens = [...new Set(tokenize(raw))]

  let candidates: Set<string> | null = null
  if (queryTokens.length > 0) {
    for (let i = 0; i < queryTokens.length; i += 1) {
      const token = queryTokens[i]
      let ids = postings.get(token)
      // The final token is treated as a prefix so a partially typed word still
      // finds things. Everything earlier must match whole.
      if (i === queryTokens.length - 1) {
        const union = new Set<string>(ids ?? [])
        for (const [candidate, set] of postings) {
          if (candidate.length > token.length && candidate.startsWith(token)) {
            for (const id of set) union.add(id)
          }
        }
        ids = union
      }
      if (!ids || ids.size === 0) return []
      candidates = candidates === null ? new Set(ids) : intersect(candidates, ids)
      if (candidates.size === 0) return []
    }
  } else {
    // A query of only short/punctuation characters: fall back to scanning the
    // entry texts, which is bounded by the index rather than the project.
    candidates = new Set(entries.keys())
  }

  const needle = raw.toLowerCase()
  const kinds = options.kinds ? new Set(options.kinds) : null
  const matches: SearchMatch[] = []

  for (const id of candidates ?? []) {
    const e = entries.get(id)
    if (!e) continue
    if (kinds && !kinds.has(e.kind)) continue

    const haystack = e.text.toLowerCase()
    const offsets: number[] = []
    let at = haystack.indexOf(needle)
    while (at !== -1) {
      offsets.push(at)
      if (offsets.length >= 50) break
      at = haystack.indexOf(needle, at + Math.max(1, needle.length))
    }
    matches.push({ entry: e, offsets, phrase: offsets.length > 0 })
    if (options.limit && matches.length >= options.limit) break
  }

  // Stable, not ranked: by kind then id, so repeated queries agree.
  matches.sort((a, b) =>
    a.entry.kind === b.entry.kind
      ? a.entry.id.localeCompare(b.entry.id)
      : a.entry.kind.localeCompare(b.entry.kind)
  )
  return matches
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  const out = new Set<string>()
  for (const id of small) if (large.has(id)) out.add(id)
  return out
}

export function stats(): SearchIndexStats {
  return { entries: entries.size, tokens: postings.size, reindexedSources, ready }
}

/** Registers the write hook. Called once at startup. */
export function install(): void {
  setProjectWriteObserver(onProjectWrite)
}

/** Test seam: waits for any in-flight indexing to settle. */
export function settled(): Promise<void> {
  return runQueued(async () => undefined)
}

/**
 * Stops reacting to project writes, and picks the index back up afterwards.
 *
 * Every project write runs applySource and then persists the WHOLE index —
 * see onProjectWrite. That is right for one document saving, and quadratic for
 * an import writing a hundred and fifty: a multi-megabyte searchIndex.json
 * rewritten once per document, through atomicWrite's Windows retry loop.
 *
 * resume() calls open(), which validates fingerprints against the real files
 * and re-indexes only what disagrees — one pass, one persist. A crash between
 * the two is self-healing, because open() runs on the next launch anyway.
 *
 * The gate lives here rather than being a setProjectWriteObserver(null) from
 * outside: the index owns whether it is listening, and nothing else has to
 * know how it is wired.
 */
let suspended = false

export function suspend(): void {
  suspended = true
}

export async function resume(): Promise<void> {
  if (!suspended) return
  suspended = false
  await open()
}
