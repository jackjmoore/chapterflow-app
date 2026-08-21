import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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
            if (!tr.docChanged) return value
            // Rebuilt rather than mapped: text edits change which words exist,
            // so the previous positions are not simply displaced.
            return { words: value.words, decorations: buildDecorations(tr.doc, value.words) }
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

function buildDecorations(doc: PMNode, words: Set<string>): DecorationSet {
  if (words.size === 0) return DecorationSet.empty

  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    WORD_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WORD_PATTERN.exec(text)) !== null) {
      if (!words.has(match[0].toLowerCase())) continue
      const from = pos + match.index
      decorations.push(
        Decoration.inline(from, from + match[0].length, {
          spellcheck: 'false',
          class: 'chf-suppressed-word'
        })
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}
