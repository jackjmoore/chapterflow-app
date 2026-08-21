import { Mark, mergeAttributes } from '@tiptap/core'
import type { Mark as PMMark } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      addComment: (commentId: string) => ReturnType
      removeComment: (commentId: string) => ReturnType
    }
  }
}

/**
 * A margin note anchored to a run of text.
 *
 * Deliberately NOT the span-tag system. A span tag applies a project-palette
 * TagDef ({ id, name, color }) to text — a shared, finite vocabulary for
 * categorizing ("foreshadowing", "needs research") that also feeds the binder
 * badges and outliner filters. Leaving the one-off remark "check this against
 * ch. 3" through that mechanism would mean minting a palette entry per
 * remark, corrupting a vocabulary other features depend on.
 *
 * The architecture is copied from SpanTag even though the payload isn't: the
 * anchor is a mark, so it rides ProseMirror's own transaction mapping and
 * survives edits elsewhere, paragraph splits, and undo/redo without
 * reimplementing any of it. The note body lives in a sidecar store keyed by
 * commentId (see commentStore.ts), the same split spanTagStore.ts uses —
 * bodies can then be listed and browsed project-wide without loading every
 * document.
 *
 * `excludes: ''` lets two comments overlap the same words, exactly as two
 * different span tags can.
 */
export const Comment = Mark.create({
  name: 'comment',

  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => ({ 'data-comment-id': attributes.commentId })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'chf-comment-mark' }), 0]
  },

  addCommands() {
    return {
      addComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),

      // Removes only the instance with this id, leaving any other comment
      // overlapping the same text alone — the same reason SpanTag can't use
      // TipTap's built-in unsetMark, which drops every instance of the type.
      removeComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks[this.name]
          const toRemove: { mark: PMMark; from: number; to: number }[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            node.marks.forEach((mark) => {
              if (mark.type === markType && mark.attrs.commentId === commentId) {
                toRemove.push({ mark, from: pos, to: pos + node.nodeSize })
              }
            })
          })
          if (toRemove.length === 0) return false
          if (dispatch) {
            toRemove.forEach(({ mark, from, to }) => tr.removeMark(from, to, mark))
            dispatch(tr)
          }
          return true
        }
    }
  }
})
