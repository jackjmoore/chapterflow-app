import { generateHTML, getSchema } from '@tiptap/core'
import { DOMParser as PMDOMParser, type Node as PMNode } from '@tiptap/pm/model'
import { createEditorExtensions } from '../editorExtensions'
import { buildSearchRegex, findMatchesInDoc, replaceAllInDoc, type Match, type SearchOptions } from './searchCore'
import type { BinderNode } from '../../../shared/binder'

export interface ProjectDocumentResult {
  documentId: string
  documentName: string
  matches: Match[]
  snippet: string
}

function collectDocuments(nodes: BinderNode[], out: { id: string; name: string }[]): void {
  for (const node of nodes) {
    if (node.type === 'document') out.push({ id: node.id, name: node.name })
    collectDocuments(node.children, out)
  }
}

export function collectAllDocuments(tree: BinderNode[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  collectDocuments(tree, out)
  return out
}

const extensions = createEditorExtensions()
const schema = getSchema(extensions)
const parser = PMDOMParser.fromSchema(schema)

export function htmlToDoc(html: string): PMNode {
  const container = document.createElement('div')
  container.innerHTML = html || '<p></p>'
  return parser.parse(container)
}

export function docToHtml(doc: PMNode): string {
  return generateHTML(doc.toJSON(), extensions)
}

function snippetAround(doc: PMNode, match: Match): string {
  const contextRadius = 34
  const before = doc.textBetween(Math.max(0, match.from - contextRadius), match.from, ' ', ' ')
  const matched = doc.textBetween(match.from, match.to, ' ', ' ')
  const after = doc.textBetween(match.to, Math.min(doc.content.size, match.to + contextRadius), ' ', ' ')
  const prefix = match.from - contextRadius > 0 ? '…' : ''
  const suffix = match.to + contextRadius < doc.content.size ? '…' : ''
  return `${prefix}${before}${matched}${after}${suffix}`.trim()
}

/**
 * Searches every document in the binder (using each one's saved HTML — the
 * caller should pass the live editor's current HTML for the active document
 * so an in-progress edit isn't missed). Returns only documents with matches.
 */
export function searchProject(
  documents: { id: string; name: string; html: string }[],
  query: string,
  options: SearchOptions
): { results: ProjectDocumentResult[]; isRegexValid: boolean } {
  const regex = buildSearchRegex(query, options)
  if (!regex) return { results: [], isRegexValid: false }

  const results: ProjectDocumentResult[] = []
  for (const document of documents) {
    const doc = htmlToDoc(document.html)
    regex.lastIndex = 0
    const matches = findMatchesInDoc(doc, regex)
    if (matches.length === 0) continue
    results.push({
      documentId: document.id,
      documentName: document.name,
      matches,
      snippet: snippetAround(doc, matches[0])
    })
  }
  return { results, isRegexValid: true }
}

/** Applies replace-all to one document's HTML, returning the new HTML. */
export function replaceAllInHtml(
  html: string,
  matches: Match[],
  replacementTemplate: string,
  useRegex: boolean
): string {
  const doc = htmlToDoc(html)
  const newDoc = replaceAllInDoc(doc, matches, replacementTemplate, useRegex)
  return docToHtml(newDoc)
}
