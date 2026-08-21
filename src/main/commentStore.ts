import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { parse, HTMLElement, NodeType } from 'node-html-parser'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { CommentRecord } from '../shared/comments'

// Half derived, half authored — the important difference from spanTagStore.
// The ANCHOR (a <span data-comment-id> mark inside documents/<id>.html) rides
// ProseMirror's own edit/undo mapping exactly as a span tag does, so this file
// never stores positions. But the BODY is content the writer typed and exists
// nowhere else, so unlike the span-tag index this file cannot simply be
// rebuilt from a document's HTML. Saving a document therefore prunes records
// whose anchor has disappeared and refreshes the snippets of those still
// present — but never invents a body it doesn't already hold.
const SNIPPET_MAX_LENGTH = 120

function indexPath(): string {
  return join(getProjectRoot(), 'comments.json')
}

interface CommentFile {
  version: 1
  comments: CommentRecord[]
}

async function loadIndex(): Promise<CommentFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return { version: 1, comments: [] }
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as CommentFile
  } catch {
    return { version: 1, comments: [] }
  }
}

function persistIndex(file: CommentFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// One file for the whole project, so every write queues through a single
// chain — the same idiom spanTagStore/backupStore use. Reads-then-writes here
// must never interleave, since a save for any document rewrites this file.
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

/** Walks TipTap HTML for `<span data-comment-id>` anchors, collecting the id
 *  and the text it wraps — the same manual recursion spanTagStore uses. */
function collectAnchors(el: HTMLElement, out: Map<string, string>): void {
  const commentId = el.getAttribute('data-comment-id')
  if (commentId && !out.has(commentId)) out.set(commentId, truncateSnippet(el.textContent))
  for (const child of el.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) collectAnchors(child as HTMLElement, out)
  }
}

function anchorsInHtml(html: string): Map<string, string> {
  const root = parse(html)
  const out = new Map<string, string>()
  for (const child of root.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) collectAnchors(child as HTMLElement, out)
  }
  return out
}

/**
 * Reconciles one document's comments against its just-saved HTML: records
 * whose anchor is gone (the writer deleted the commented text) are dropped,
 * and survivors get a refreshed snippet. Called from the document:save IPC
 * handler with the same html just written, so it can't race what's on disk.
 */
export function reconcileForDocument(documentId: string, html: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const anchors = anchorsInHtml(html)
    const next = file.comments.filter((c) => {
      if (c.documentId !== documentId) return true
      return anchors.has(c.id)
    })
    const refreshed = next.map((c) => {
      if (c.documentId !== documentId) return c
      const snippet = anchors.get(c.id)
      return snippet === undefined || snippet === c.snippet ? c : { ...c, snippet }
    })
    await persistIndex({ version: 1, comments: refreshed })
  })
}

/** Creates the body record for a comment whose anchor the editor has just
 *  applied. The mark and this record are written in the same user action. */
export function addComment(record: CommentRecord): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const without = file.comments.filter((c) => c.id !== record.id)
    await persistIndex({ version: 1, comments: [...without, record] })
  })
}

export function updateComment(id: string, changes: Partial<Pick<CommentRecord, 'body' | 'resolved'>>): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({
      version: 1,
      comments: file.comments.map((c) => (c.id === id ? { ...c, ...changes } : c))
    })
  })
}

/** Drops the body when the writer removes the comment outright. The caller
 *  removes the anchor mark in the same action. */
export function deleteComment(id: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({ version: 1, comments: file.comments.filter((c) => c.id !== id) })
  })
}

/** Called when the document itself is deleted, so its comments don't outlive it. */
export function deleteAllForDocument(documentId: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({ version: 1, comments: file.comments.filter((c) => c.documentId !== documentId) })
  })
}

export async function listComments(): Promise<CommentRecord[]> {
  return (await loadIndex()).comments
}
