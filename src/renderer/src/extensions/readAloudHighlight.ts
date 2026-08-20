import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const readAloudHighlightKey = new PluginKey('readAloudHighlight')

interface HighlightState {
  from: number
  to: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    readAloudHighlight: {
      setSpokenRange: (range: { from: number; to: number } | null) => ReturnType
    }
  }
}

/**
 * Marks the sentence currently being spoken.
 *
 * A decoration rather than a mark: this is transient view state, so it must
 * never enter the document, never make the editor dirty, and never reach
 * autosave. Same reasoning as the find-bar's match highlighting.
 */
export const ReadAloudHighlight = Extension.create({
  name: 'readAloudHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: readAloudHighlightKey,
        state: {
          init: () => null as HighlightState | null,
          apply(tr, value) {
            const meta = tr.getMeta(readAloudHighlightKey) as HighlightState | null | undefined
            if (meta !== undefined) return meta
            // Keep the highlight pinned to its text if the document changes
            // underneath it (the reader can still edit while listening).
            if (value && tr.docChanged) {
              return { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to) }
            }
            return value
          }
        },
        props: {
          decorations(state) {
            const range = readAloudHighlightKey.getState(state) as HighlightState | null
            if (!range || range.to <= range.from) return DecorationSet.empty
            const max = state.doc.content.size
            const from = Math.max(0, Math.min(range.from, max))
            const to = Math.max(from, Math.min(range.to, max))
            if (to <= from) return DecorationSet.empty
            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, { class: 'read-aloud-spoken' })
            ])
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setSpokenRange:
        (range) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(readAloudHighlightKey, range))
          return true
        }
    }
  }
})
