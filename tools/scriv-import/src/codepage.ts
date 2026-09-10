import * as iconv from 'iconv-lite'

/**
 * Decoding RTF's byte payloads.
 *
 * RTF is byte-oriented: TEXT tokens and \'XX escapes carry raw bytes in the
 * codepage the file declares with \ansicpg. Decoding them as latin1 — the
 * tempting shortcut, since latin1 is byte-transparent — is wrong in exactly
 * the range that matters: cp1252 and latin1 differ across 0x80-0x9F, which is
 * where the smart quotes and dashes live. Every curly apostrophe in a
 * manuscript would become an invisible C1 control character.
 *
 * iconv-lite covers cp1252, UTF-8, the DBCS pages and Mac Roman, so this is a
 * name mapping rather than a table.
 */

/** RTF names its codepage by number; iconv-lite names it by string. */
export function encodingFor(ansicpg: number | null): { encoding: string; fellBack: boolean } {
  // No \ansicpg at all means Windows-1252 by convention — the overwhelmingly
  // common case, and what every Windows RTF writer emits.
  if (ansicpg === null) return { encoding: 'win1252', fellBack: false }
  if (ansicpg === 65001) return { encoding: 'utf8', fellBack: false }
  // 10000 is Mac Roman. Reachable from macOS-authored files, which are the
  // acknowledged untested case — the mapping is here so that when one does
  // turn up it decodes rather than mangles.
  if (ansicpg === 10000) return { encoding: 'macintosh', fellBack: false }

  for (const name of [`cp${ansicpg}`, `win${ansicpg}`, `windows-${ansicpg}`]) {
    if (iconv.encodingExists(name)) return { encoding: name, fellBack: false }
  }
  // Unknown page: 1252 is the least-bad guess, but the caller tallies a
  // warning so the import can say the text may be wrong rather than
  // presenting it as clean.
  return { encoding: 'win1252', fellBack: true }
}

/**
 * Decodes a run of bytes.
 *
 * Called on an accumulated buffer rather than per byte, because under UTF-8 or
 * a DBCS page consecutive \'XX escapes are *one* character split across bytes
 * and decoding each alone yields one U+FFFD per byte.
 */
export function decodeBytes(bytes: number[], encoding: string): string {
  if (bytes.length === 0) return ''
  return iconv.decode(Buffer.from(bytes), encoding)
}
