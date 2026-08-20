/** Forwarded from the main process's native `context-menu` handler when the
 *  right-click landed in the main editor, so the renderer can draw one merged
 *  menu (OS spellcheck suggestions + app actions) instead of the plain native one. */
export interface EditorContextMenuPayload {
  x: number
  y: number
  misspelledWord: string
  dictionarySuggestions: string[]
  hasSelection: boolean
}
