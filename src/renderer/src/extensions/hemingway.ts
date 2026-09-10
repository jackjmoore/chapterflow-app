import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface HemingwayOptions {
  /** Called each time a deletion is refused, so the interface can show that
   *  the key was heard and declined rather than simply broken. */
  onBlocked: (() => void) | null
}

export interface HemingwayStorage {
  active: boolean
}

const DELETE_KEYS = new Set(['Backspace', 'Delete'])

/** The input types a Backspace or Delete keystroke produces, on any keyboard
 *  or input method. Cut and drag-to-move also delete, but they are not those
 *  keys and are deliberately left alone. */
function isKeyDeletion(inputType: string): boolean {
  return inputType.startsWith('delete') && inputType !== 'deleteByCut' && inputType !== 'deleteByDrag'
}

/**
 * Hemingway mode: writing forward only.
 *
 * While active, Backspace and Delete do nothing — with or without modifiers,
 * as a key or as the input event a soft keyboard or input method raises in
 * its place. Everything else is untouched: the document is not made
 * read-only, selection and navigation work, and typing, formatting and undo
 * are as they were. The mode is a discipline about deletion, not a lock.
 *
 * The flag lives in extension storage rather than plugin state so that
 * switching it never dispatches a transaction — it is read at the moment a
 * key arrives and nowhere else.
 */
export const Hemingway = Extension.create<HemingwayOptions, HemingwayStorage>({
  name: 'hemingway',

  addOptions() {
    return { onBlocked: null }
  },

  addStorage() {
    return { active: false }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    const options = this.options
    const refuse = (event: Event): boolean => {
      event.preventDefault()
      options.onBlocked?.()
      return true
    }

    return [
      new Plugin({
        key: new PluginKey('hemingway'),
        props: {
          handleKeyDown(_view, event) {
            if (!storage.active || !DELETE_KEYS.has(event.key)) return false
            return refuse(event)
          },
          handleDOMEvents: {
            beforeinput(_view, event) {
              if (!storage.active || !isKeyDeletion((event as InputEvent).inputType)) return false
              return refuse(event)
            }
          }
        }
      })
    ]
  }
})

/** Switches the mode for one editor instance. A storage write, not a
 *  command: nothing about the document changes, so no transaction is owed. */
export function setHemingwayActive(editor: Editor | null, active: boolean): void {
  if (!editor) return
  const storage = editor.storage.hemingway as HemingwayStorage | undefined
  if (storage) storage.active = active
}
