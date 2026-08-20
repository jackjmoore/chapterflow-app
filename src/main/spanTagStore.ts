import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { parse, HTMLElement, NodeType } from 'node-html-parser'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { SpanTagRecord } from '../shared/spanTags'

// A derived cache, not a source of truth: the actual anchor for a tagged
// span is the <span data-span-id data-tag-id> mark inside documents/<id>.html
// itself (so it rides ProseMirror's own edit/undo mapping, the same way
// bold or highlight already does). This file exists only so the binder,
// outliner, corkboard, and a project-wide browse view don't have to reparse
// every document's full HTML just to know which tags appear where — it's
// rebuilt from a document's HTML every time that document saves, so it can
// never drift out of sync with the real anchors, and a snapshot restore
// (which re-enters through the same document:save path) rebuilds it too
// with no special-casing.
const SNIPPET_MAX_LENGTH = 120

function indexPath(): string {
  return join(getProjectRoot(), 'spanTags.json')
}

interface SpanTagFile {
  version: 1
  spans: SpanTagRecord[]
}

async function loadIndex(): Promise<SpanTagFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return { version: 1, spans: [] }
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as SpanTagFile
  } catch {
    return { version: 1, spans: [] }
  }
}

function persistIndex(file: SpanTagFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// The whole project shares one small file, so updates are queued through a
// single chain (same promise-chain idiom atomicWrite/backupStore already
// use) rather than per-document queues — a save for any document rewrites
// this same file, and reads-then-writes must never interleave.
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function truncateSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > SNIPPET_MAX_LENGTH ? `${collapsed.slice(0, SNIPPET_MAX_LENGTH)}…` : collapsed
}

/** Walks TipTap-generated HTML for `<span data-span-id data-tag-id>` marks —
 *  same manual-recursion style export/htmlToBlocks.ts already uses to parse
 *  this app's saved HTML, just collecting span tags instead of format runs. */
function collectSpanTags(el: HTMLElement, documentId: string, out: SpanTagRecord[]): void {
  const spanId = el.getAttribute('data-span-id')
  const tagId = el.getAttribute('data-tag-id')
  if (spanId && tagId) {
    out.push({ id: spanId, tagId, documentId, snippet: truncateSnippet(el.textContent) })
  }
  for (const child of el.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) collectSpanTags(child as HTMLElement, documentId, out)
  }
}

function extractSpansFromHtml(documentId: string, html: string): SpanTagRecord[] {
  const root = parse(html)
  const out: SpanTagRecord[] = []
  for (const child of root.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) collectSpanTags(child as HTMLElement, documentId, out)
  }
  return out
}

/** Re-derives one document's span-tag records from its just-saved HTML and
 *  replaces its entries in the index. Called from the document:save IPC
 *  handler with the same html string that was just written to disk, so this
 *  never re-reads from disk and can't race what's actually saved. */
export function rebuildForDocument(documentId: string, html: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const kept = file.spans.filter((s) => s.documentId !== documentId)
    const fresh = extractSpansFromHtml(documentId, html)
    await persistIndex({ version: 1, spans: [...kept, ...fresh] })
  })
}

/** Called when the document itself is deleted, so its span records don't
 *  outlive it in the index. */
export function deleteAllForDocument(documentId: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({ version: 1, spans: file.spans.filter((s) => s.documentId !== documentId) })
  })
}

export async function listSpans(): Promise<SpanTagRecord[]> {
  return (await loadIndex()).spans
}
