import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spellcheckSuppress: {
      /** Replaces the suppressed word list. Lower-cased by the caller. */
      setSuppressedWords: (words: string[]) => ReturnType
    }
  }
}

export const spellcheckSuppressKey = new PluginKey<SuppressState>('spellcheckSuppress')

interface SuppressState {
  words: Set<string>
  decorations: DecorationSet
}

/**
 * Stops the spellchecker flagging the project's own vocabulary — without
 * telling the operating system anything.
 *
 * Electron does expose session.addWordToSpellCheckerDictionary, and it is
 * deliberately not used: on Windows 10+ and macOS it writes through to the
 * *OS* custom dictionary, so a character's name would silently become a
 * "correct" word in Word, Notes and everywhere else on the machine. That side
 * effect is not ours to cause.
 *
 * What this does instead: Chromium honours the `spellcheck` attribute per
 * element, including on elements nested inside a contenteditable. Wrapping an
 * occurrence in `<span spellcheck="false">` makes the checker skip that word
 * while every other word in the same editor is still checked. Verified
 * directly rather than assumed — the same nonsense word, bare and wrapped, in
 * one contenteditable, reported by Chromium's own context-menu event as:
 *
 *     bare     -> misspelledWord="flimbrex"  suggestions=5
 *     wrapped  -> misspelledWord=""          suggestions=0
 *
 * Suggestions therefore vanish for free: both context menus read
 * `params.misspelledWord`, which is empty for a suppressed word.
 *
 * Applied as a decoration, so the attribute exists only in the view. The
 * document is never modified: nothing is written to disk, exports are
 * untouched, and undo/redo never sees it.
 */
export const SpellcheckSuppress = Extension.create({
  name: 'spellcheckSuppress',

  addCommands() {
    return {
      setSuppressedWords:
        (words: string[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellcheckSuppressKey, { words })
            // Purely a view concern; it must never enter the undo history or
            // mark the document dirty.
            tr.setMeta('addToHistory', false)
            dispatch(tr)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SuppressState>({
        key: spellcheckSuppressKey,

        state: {
          init: () => ({ words: new Set<string>(), decorations: DecorationSet.empty }),
          apply(tr, value) {
            const meta = tr.getMeta(spellcheckSuppressKey) as { words: string[] } | undefined
            if (meta) {
              const words = new Set(meta.words)
              return { words, decorations: buildDecorations(tr.doc, words) }
            }
            if (!tr.docChanged || value.words.size === 0) return value
            // Text edits change which words exist, so the previous positions
            // cannot simply be displaced — but only inside the paragraphs the
            // edit touched. Everything else is mapped, and just those
            // paragraphs are re-scanned. Re-scanning the whole document on
            // every keystroke was a full pass over 100,000 words per key in
            // any project with a Story Bible.
            return { words: value.words, decorations: rescanChangedBlocks(tr, value.decorations, value.words) }
          }
        },

        props: {
          decorations(state) {
            return spellcheckSuppressKey.getState(state)?.decorations ?? DecorationSet.empty
          }
        }
      })
    ]
  }
})

/** Word characters for matching: letters, digits, and the apostrophes and
 *  hyphens that sit inside names. Anything else is a boundary. */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Suppression decorations for every occurrence between two positions. */
function collectDecorations(doc: PMNode, from: number, to: number, words: Set<string>): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    WORD_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WORD_PATTERN.exec(text)) !== null) {
      if (!words.has(match[0].toLowerCase())) continue
      const start = pos + match.index
      decorations.push(
        Decoration.inline(start, start + match[0].length, {
          spellcheck: 'false',
          class: 'chf-suppressed-word'
        })
      )
    }
  })
  return decorations
}

function buildDecorations(doc: PMNode, words: Set<string>): DecorationSet {
  if (words.size === 0) return DecorationSet.empty
  return DecorationSet.create(doc, collectDecorations(doc, 0, doc.content.size, words))
}

/**
 * Maps the existing decorations through the transaction, then re-scans only
 * the textblocks its steps changed. Each step's changed range is carried
 * through the steps after it into the final document, then widened to the
 * enclosing paragraph on either side, so a text node is never scanned in
 * part.
 */
function rescanChangedBlocks(tr: Transaction, previous: DecorationSet, words: Set<string>): DecorationSet {
  let decorations = previous.map(tr.mapping, tr.doc)
  const doc = tr.doc
  tr.mapping.maps.forEach((stepMap, index) => {
    const rest = tr.mapping.slice(index + 1)
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = rest.map(newStart, -1)
      const to = rest.map(newEnd, 1)
      const $from = doc.resolve(Math.min(from, doc.content.size))
      const $to = doc.resolve(Math.min(to, doc.content.size))
      const start = $from.parent.isTextblock ? $from.start() : $from.pos
      const end = $to.parent.isTextblock ? $to.end() : $to.pos
      if (end <= start) return
      decorations = decorations.remove(decorations.find(start, end))
      decorations = decorations.add(doc, collectDecorations(doc, start, end, words))
    })
  })
  return decorations
}
