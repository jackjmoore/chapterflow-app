import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (text?: string) => ReturnType
      updateFootnote: (pos: number, text: string) => ReturnType
    }
  }
}

export const footnoteNumberingKey = new PluginKey('footnoteNumbering')

/**
 * An inline footnote: a superscript marker in the text, with the note's own
 * text carried in the node's attributes.
 *
 * Storing the text on the node (rather than in a sidecar store keyed by id)
 * is deliberate — it means the note travels with the document HTML, survives
 * copy/paste between documents, and rides undo/redo for free, with no second
 * file that could drift out of sync with the text it annotates.
 *
 * Numbering is NOT stored. It's computed from document order every render by
 * the decoration plugin below, so deleting footnote 2 renumbers 3, 4, 5
 * automatically instead of leaving a gap. Export recomputes it the same way
 * from the same document order.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote') ?? '',
        renderHTML: (attributes) => ({ 'data-footnote': attributes.text ?? '' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // The marker's visible number is supplied by the decoration plugin in the
    // editor and recomputed at export time; the serialized HTML carries only
    // the note text, which is the part that's actually authored data.
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'chf-footnote' })]
  },

  addCommands() {
    return {
      insertFootnote:
        (text = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { text } }),

      updateFootnote:
        (pos: number, text: string) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== 'footnote') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, text })
            dispatch(tr)
          }
          return true
        }
    }
  },

  /** Paints the running number onto each marker as a CSS custom property, so
   *  the numbers stay correct after any edit without being part of the
   *  document's stored data. */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnoteNumberingKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            let index = 0
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'footnote') return
              index += 1
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  style: `--chf-footnote-number: "${index}"`
                })
              )
            })
            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  }
})

/** One footnote's text in document order — the shape both the editor's
 *  bottom-of-document list and the export renderers work from. */
export interface FootnoteEntry {
  number: number
  text: string
  pos: number
}

/** Walks a ProseMirror doc for its footnotes, in the order they appear. The
 *  single source of numbering truth for the on-screen list. */
export function collectFootnotes(doc: {
  descendants: (fn: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void) => void
}): FootnoteEntry[] {
  const entries: FootnoteEntry[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'footnote') return
    entries.push({ number: entries.length + 1, text: String(node.attrs.text ?? ''), pos })
  })
  return entries
}
