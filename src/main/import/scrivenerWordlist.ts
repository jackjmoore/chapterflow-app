import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Scrivener's personal dictionary.
 *
 * The words a writer has told Scrivener to stop flagging. Two things about it
 * shape everything here.
 *
 * It is **machine-wide**, not per-project: one file shared by every Scrivener
 * project on the computer. So it routinely holds names from manuscripts that
 * have nothing to do with the one being imported into, alongside ordinary
 * spellings the writer simply prefers — and, in practice, the occasional
 * accepted typo. That is why nothing here imports anything: it parses, and the
 * writer chooses.
 *
 * And despite one of its two names ending in .txt, it is an INI file:
 *
 *     [General]
 *     personal=S’pose, neighbour, Pwca, brutalised, Ral, mould, …
 *
 * A line-per-word reader — the obvious guess — yields exactly one enormous
 * "word". Verified against a real installation.
 */

export type WordlistKind = 'literatureAndLatte' | 'scrivener'

export interface WordlistLocation {
  kind: WordlistKind
  path: string
  /** How to describe this location to a person. */
  label: string
}

export interface ParsedWordlist {
  location: WordlistLocation | null
  words: string[]
  /** Words dropped as case-insensitive duplicates of an earlier one. */
  duplicates: number
  /** Set when the file parsed to nothing, so the caller can say so rather
   *  than presenting an empty list as a successful read. */
  empty: boolean
}

export interface WordlistScan {
  /** Only the locations that actually exist on disk. */
  found: WordlistLocation[]
  /**
   * True when more than one exists. Deliberately surfaced rather than
   * resolved: there is no documented rule for which of the two wins, so
   * guessing risks importing the stale one.
   */
  ambiguous: boolean
}

/** Both documented locations, whether or not they exist. */
export function knownWordlistPaths(): WordlistLocation[] {
  const local = process.env.LOCALAPPDATA ?? ''
  return [
    {
      kind: 'literatureAndLatte',
      path: join(local, 'LiteratureAndLatte', 'Scrivener', 'wordlists.txt'),
      label: 'LiteratureAndLatte\\Scrivener\\wordlists.txt'
    },
    {
      kind: 'scrivener',
      path: join(local, 'Scrivener', 'Scrivener', 'wordlists.ini'),
      label: 'Scrivener\\Scrivener\\wordlists.ini'
    }
  ]
}

export function scanForWordlists(): WordlistScan {
  const found = knownWordlistPaths().filter((l) => l.path && existsSync(l.path))
  return { found, ambiguous: found.length > 1 }
}

/** Decodes with the encoding the file declares, rather than assuming UTF-8:
 *  these can be written as UTF-16 depending on the Windows build. */
function decode(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le')
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Big-endian: swap into little-endian before decoding.
    const swapped = Buffer.from(buffer.subarray(2))
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8')
  }
  return buffer.toString('utf-8')
}

/**
 * Parses either shape.
 *
 * The INI form is what a real installation writes. The line-per-word form is
 * handled too because the second location's name (.ini) is no guarantee of
 * either, and a wrong guess here would be invisible — the writer would simply
 * see a nonsense list, which is at least better than a silent one.
 */
export function parseWordlistText(text: string): { words: string[]; duplicates: number } {
  const lines = text.split(/\r?\n/)

  const collected: string[] = []
  let sawKeyedList = false

  for (const line of lines) {
    const keyed = /^\s*(?:personal|words|wordlist)\s*=\s*(.*)$/i.exec(line)
    if (keyed) {
      sawKeyedList = true
      for (const part of keyed[1].split(',')) collected.push(part)
    }
  }

  if (!sawKeyedList) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) continue
      if (trimmed.startsWith(';') || trimmed.startsWith('#')) continue
      // A key we do not recognise carries no words worth guessing at.
      if (/^[A-Za-z_][\w ]*=/.test(trimmed)) continue
      collected.push(trimmed)
    }
  }

  const seen = new Set<string>()
  const words: string[] = []
  let duplicates = 0
  for (const raw of collected) {
    const word = raw.trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    words.push(word)
  }

  // Alphabetical, case-insensitively: the file's own order is the order words
  // happened to be added over years, which is no order at all to read in.
  words.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return { words, duplicates }
}

export async function readWordlist(location: WordlistLocation | null, path: string): Promise<ParsedWordlist> {
  const buffer = await readFile(path)
  const { words, duplicates } = parseWordlistText(decode(buffer))
  return { location, words, duplicates, empty: words.length === 0 }
}
