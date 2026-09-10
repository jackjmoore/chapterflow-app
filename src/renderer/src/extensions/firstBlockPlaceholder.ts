import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface FirstBlockPlaceholderOptions {
  placeholder: string
}

/**
 * The "Start writing..." prompt on an empty document.
 *
 * Replaces @tiptap/extension-placeholder for the manuscript editors. That
 * extension decides which nodes are empty by walking every node of the
 * document on every view update, and on a 100,000-word manuscript that walk
 * ran on each keystroke to find, every time, that nothing was empty. The
 * stylesheet only ever showed the prompt on the first paragraph of an empty
 * document anyway (`p.is-editor-empty:first-child::before`), so that is the
 * only case this checks — and it is answerable from the document's first
 * child alone, without visiting the rest.
 *
 * Emits the same class names and data attribute the original did, so the
 * existing CSS applies unchanged.
 */
export const FirstBlockPlaceholder = Extension.create<FirstBlockPlaceholderOptions>({
  name: 'firstBlockPlaceholder',

  addOptions() {
    return { placeholder: '' }
  },

  addProseMirrorPlugins() {
    const { placeholder } = this.options
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('firstBlockPlaceholder'),
        props: {
          decorations(state) {
            const { doc } = state
            const first = doc.firstChild
            if (!editor.isEditable || doc.childCount !== 1 || !first || !first.isTextblock || first.childCount !== 0) {
              return DecorationSet.empty
            }
            return DecorationSet.create(doc, [
              Decoration.node(0, first.nodeSize, {
                class: 'is-empty is-editor-empty',
                'data-placeholder': placeholder
              })
            ])
          }
        }
      })
    ]
  }
})
