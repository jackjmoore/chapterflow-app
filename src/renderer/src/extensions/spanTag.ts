import { Mark, mergeAttributes } from '@tiptap/core'
import type { Mark as PMMark } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spanTag: {
      addSpanTag: (tagId: string) => ReturnType
      removeSpanTag: (tagId: string) => ReturnType
      toggleSpanTag: (tagId: string) => ReturnType
    }
  }
}

/**
 * Tags a run of text with a project tag id, anchored the same way bold or
 * highlight is: as a ProseMirror mark on the text itself, not as a stored
 * position. That's what lets it survive edits anywhere else in the
 * document, paragraph splits, and undo/redo for free — it rides the
 * editor's own transaction/mapping system instead of needing any of that
 * logic reimplemented.
 *
 * `excludes: ''` (rather than the default, which excludes other instances
 * of the same mark type) lets multiple different tags stack on the same or
 * overlapping text — each application is its own mark instance with its own
 * spanId, so partial overlaps are just ordinary ProseMirror mark ranges.
 */
export const SpanTag = Mark.create({
  name: 'spanTag',

  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      spanId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-span-id'),
        renderHTML: (attributes) => ({ 'data-span-id': attributes.spanId })
      },
      tagId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-tag-id'),
        renderHTML: (attributes) => ({ 'data-tag-id': attributes.tagId })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-span-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'span-tag-mark' }), 0]
  },

  addCommands() {
    return {
      addSpanTag:
        (tagId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { tagId, spanId: crypto.randomUUID() }),

      // Removes only mark instances whose tagId matches, leaving any other
      // tags on overlapping text untouched — this is why we can't use
      // TipTap's built-in unsetMark(name), which drops every instance of
      // the mark type regardless of attrs.
      removeSpanTag:
        (tagId: string) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          const markType = state.schema.marks[this.name]
          const toRemove: PMMark[] = []
          state.doc.nodesBetween(from, to, (node) => {
            node.marks.forEach((mark) => {
              if (mark.type === markType && mark.attrs.tagId === tagId && !toRemove.some((m) => m.eq(mark))) {
                toRemove.push(mark)
              }
            })
          })
          if (toRemove.length === 0) return false
          if (dispatch) {
            toRemove.forEach((mark) => tr.removeMark(from, to, mark))
            dispatch(tr)
          }
          return true
        },

      toggleSpanTag:
        (tagId: string) =>
        ({ editor, commands }) =>
          editor.isActive(this.name, { tagId }) ? commands.removeSpanTag(tagId) : commands.addSpanTag(tagId)
    }
  }
})
