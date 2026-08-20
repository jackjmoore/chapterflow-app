import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { FontSize } from './extensions/fontSize'
import { LineHeight } from './extensions/lineHeight'
import { SpanTag } from './extensions/spanTag'
import { MentionHighlight } from './extensions/mentionHighlight'

/**
 * The document schema/extensions, shared between the live editor and
 * headless parsing (project-wide search & replace, which loads other
 * documents' HTML without opening them in a real editor instance). Keeping
 * one shared list guarantees both paths parse and serialize identically.
 */
export function createEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      horizontalRule: false,
      strike: false,
      heading: { levels: [1, 2, 3] },
      // A generous but bounded undo history — long enough for a real
      // writing session, without letting memory grow unbounded.
      history: { depth: 100, newGroupDelay: 500 }
    }),
    Underline,
    Placeholder.configure({ placeholder: 'Start writing...' }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    LineHeight,
    SpanTag,
    MentionHighlight
  ]
}

/**
 * Extension set for a Story Bible text block's own small editor instance.
 * Same formatting extensions as the main document editor, minus SpanTag
 * (keyed off binder document ids, meaningless outside one) and FindReplace
 * (inert without FindBar driving it — the main document editor's only
 * consumer).
 */
export function createStoryBibleBlockExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      horizontalRule: false,
      strike: false,
      heading: { levels: [1, 2, 3] },
      history: { depth: 100, newGroupDelay: 500 }
    }),
    Underline,
    Placeholder.configure({ placeholder: 'Write something…' }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    LineHeight
  ]
}
