import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentLink: {
      setDocumentLink: (documentId: string) => ReturnType
      unsetDocumentLink: () => ReturnType
    }
  }
}

/** Fired on window when a link is Ctrl/Cmd-clicked — the extension lives in
 *  the shared, parameterless extension list (headless parsing needs the mark
 *  in the schema too), so it can't take a navigation callback; the app
 *  listens for this instead. */
export const DOCUMENT_LINK_OPEN_EVENT = 'chapterflow:open-doc-link'

/**
 * A manual cross-reference from a run of text to another binder document —
 * distinct from the Story Bible's automatic entity detection: nothing is
 * matched or derived, the writer chose both the text and the target.
 *
 * Stores ONLY the target's document id (data-doc-link), never its name or
 * path — the id is resolved against the live tree at click time, which is
 * what makes the link survive renames: there is no stale text to go stale.
 * Anchored as a mark (like spanTag), so it rides edits, splits, and
 * undo/redo through the editor's own transaction mapping.
 */
export const DocumentLink = Mark.create({
  name: 'documentLink',

  // A run of text points at one document; applying a second link replaces
  // the first (the default same-type exclusion — deliberately unlike
  // spanTag's stacking).
  inclusive: false,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-doc-link'),
        renderHTML: (attributes) => ({ 'data-doc-link': attributes.documentId })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-doc-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // The title is deliberately static — baking the target's name into the
    // saved HTML would go stale on rename, the exact failure this mark's
    // id-only storage exists to avoid.
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'doc-link-mark', title: 'Ctrl+Click to open the linked document' }),
      0
    ]
  },

  addCommands() {
    return {
      setDocumentLink:
        (documentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { documentId }),

      unsetDocumentLink:
        () =>
        ({ chain }) =>
          // extendMarkRange first, so "remove link" works from a bare cursor
          // inside the linked text, not only from a full selection of it.
          chain().extendMarkRange(this.name).unsetMark(this.name).run()
    }
  },

  addProseMirrorPlugins() {
    const markName = this.name
    return [
      new Plugin({
        key: new PluginKey('documentLinkClick'),
        props: {
          // Ctrl/Cmd+click, not plain click: a plain click in an editor is
          // how you place the cursor, and linked text must stay editable
          // text first.
          handleClick(view, pos, event) {
            if (!event.ctrlKey && !event.metaKey) return false
            const $pos = view.state.doc.resolve(pos)
            const mark = $pos
              .marks()
              .concat($pos.nodeAfter?.marks ?? [])
              .find((m) => m.type.name === markName)
            if (!mark?.attrs.documentId) return false
            window.dispatchEvent(
              new CustomEvent(DOCUMENT_LINK_OPEN_EVENT, { detail: { documentId: mark.attrs.documentId } })
            )
            return true
          }
        }
      })
    ]
  }
})
