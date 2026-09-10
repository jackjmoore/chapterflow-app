import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { RevisionDiff } from '../revisionDiff'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    revisionHighlight: {
      /** Paints a freshly measured diff, or clears the mode with null. */
      setRevisionDiff: (diff: RevisionDiff | null) => ReturnType
    }
  }
}

export const revisionHighlightKey = new PluginKey<RevisionDiff | null>('revisionHighlight')

/**
 * Shows what has changed since the most recent snapshot, painted onto the live
 * text.
 *
 * Decorations, never marks. Revision mode is a way of looking at the document,
 * not a change to it: nothing here reaches getHTML(), so autosave, export, and
 * every other consumer of the document see exactly what they would with the
 * mode off. Same reasoning as read-aloud's highlight and the find bar's
 * matches.
 *
 * Additions wrap text that really is in the document, so they are ordinary
 * inline decorations. Deletions cannot be — the text is gone. They are widgets
 * carrying their own copy of the removed words, which is why the deleted span
 * is inert (not editable, not selectable, not clickable): it looks like part
 * of the sentence, and must never behave like it.
 */
export const RevisionHighlight = Extension.create({
  name: 'revisionHighlight',

  addCommands() {
    return {
      setRevisionDiff:
        (diff: RevisionDiff | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            // Repainting is not an edit. Keeping it out of the history is what
            // lets someone undo their way back through their own writing with
            // the mode on and never step through a decoration refresh.
            tr.setMeta(revisionHighlightKey, diff)
            tr.setMeta('addToHistory', false)
            dispatch(tr)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: revisionHighlightKey,

        state: {
          init: () => null as RevisionDiff | null,
          apply(tr, value) {
            const meta = tr.getMeta(revisionHighlightKey) as RevisionDiff | null | undefined
            if (meta !== undefined) return meta
            if (!value || !tr.docChanged) return value
            // Between recomputes the diff is stale but not wrong: mapping it
            // through the change keeps each highlight on the words it
            // describes instead of letting it slide as the writer types.
            return {
              additions: value.additions.map((addition) => ({
                from: tr.mapping.map(addition.from),
                to: tr.mapping.map(addition.to)
              })),
              deletions: value.deletions.map((deletion) => ({
                ...deletion,
                pos: tr.mapping.map(deletion.pos)
              })),
              hasChanges: value.hasChanges
            }
          }
        },

        props: {
          decorations(state) {
            const diff = revisionHighlightKey.getState(state)
            if (!diff || !diff.hasChanges) return DecorationSet.empty

            const max = state.doc.content.size
            const decorations: Decoration[] = []

            for (const addition of diff.additions) {
              const from = Math.max(0, Math.min(addition.from, max))
              const to = Math.max(from, Math.min(addition.to, max))
              if (to <= from) continue
              decorations.push(Decoration.inline(from, to, { class: 'chf-revision-add' }))
            }

            for (const deletion of diff.deletions) {
              const pos = Math.max(0, Math.min(deletion.pos, max))
              decorations.push(
                Decoration.widget(
                  pos,
                  () => {
                    const span = document.createElement('span')
                    span.className = 'chf-revision-del'
                    span.textContent = deletion.text
                    // Inert on every axis a real span would not be: the caret
                    // must not land inside it, a drag-select must not pick it
                    // up, and a copy must not carry deleted text away.
                    span.contentEditable = 'false'
                    span.setAttribute('aria-hidden', 'true')
                    return span
                  },
                  // side: -1 puts the removed words before the text that
                  // replaced them, reading in the order they were written.
                  // The key lets ProseMirror reuse the node across redraws
                  // rather than rebuilding every deletion on each repaint.
                  { side: -1, key: `revision-del-${pos}-${deletion.text}` }
                )
              )
            }

            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  }
})
