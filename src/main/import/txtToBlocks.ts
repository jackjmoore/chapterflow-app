import type { Block } from '../export/htmlToBlocks'

/** Plain text becomes plain paragraphs — deliberately no structure guessing
 *  (no treating ALL-CAPS lines as headings, no bullet sniffing). Blank lines
 *  separate paragraphs; single newlines inside a paragraph become spaces,
 *  which is how hard-wrapped .txt files are meant to read. */
export function txtToBlocks(raw: string): Block[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split('\n').map((line) => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .map((paragraph): Block => ({ kind: 'paragraph', runs: [{ text: paragraph }] }))
}
