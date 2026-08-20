import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { blocksToHtml } from '../export/blocksToHtml'
import { docxToBlocks } from './docxToBlocks'
import { txtToBlocks } from './txtToBlocks'
import type { ImportWarningKind } from '../../shared/import'

export const IMPORT_EXTENSIONS = ['txt', 'docx'] as const

export interface ParsedImportFile {
  /** Document name: the source filename without its extension. */
  name: string
  /** Editor-ready HTML, in the same shape TipTap itself serializes. */
  html: string
  warnings: Partial<Record<ImportWarningKind, number>>
}

/**
 * Parses one file into the HTML a document is stored as. Both formats route
 * through the app's existing Block model and blocksToHtml — the same
 * representation export uses in the other direction — so imported content can
 * only ever contain markup the editor schema already supports.
 */
export async function parseImportFile(filePath: string): Promise<ParsedImportFile> {
  const extension = extname(filePath).toLowerCase()
  const name = basename(filePath, extname(filePath)).trim() || 'Untitled'

  if (extension === '.txt') {
    const raw = await readFile(filePath, 'utf-8')
    const blocks = txtToBlocks(raw)
    return { name, html: blocksToHtml(blocks, { paragraphWrappedNodes: true }), warnings: {} }
  }

  if (extension === '.docx') {
    const buffer = await readFile(filePath)
    const { blocks, warnings } = await docxToBlocks(buffer)
    return { name, html: blocksToHtml(blocks, { paragraphWrappedNodes: true }), warnings }
  }

  throw new Error(`Unsupported file type "${extension || 'unknown'}" — only .txt and .docx can be imported`)
}
