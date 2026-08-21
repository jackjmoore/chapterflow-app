import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    structuralBreaks: {
      insertPageBreak: () => ReturnType
      insertChapterBreak: () => ReturnType
      insertChapterLine: () => ReturnType
    }
  }
}

/**
 * The three structural block nodes the Insert menu adds.
 *
 * All three are atoms: no editable content of their own, selectable and
 * deletable as a single unit, so a writer can never end up with a cursor
 * stranded "inside" a divider. Each serializes to a distinct data attribute
 * rather than a bare <hr>, which is what lets the export block model tell
 * them apart — a generic <hr> would be indistinguishable from the scene-break
 * text convention (`***`, `---`) the manuscript preset already normalizes.
 *
 * StarterKit's own horizontalRule stays disabled (see editorExtensions.ts);
 * these replace it with named, semantically distinct breaks.
 */

/** A hard page break: start the next page here, nothing more. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-page-break': 'true', class: 'chf-page-break' })
    ]
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})

/**
 * A chapter boundary. Also breaks the page, but carries the extra meaning
 * that a new chapter starts here — which manuscript-format export uses to
 * apply the standard "chapter opens a third of the way down the page"
 * convention. That semantic difference is the whole reason this isn't just
 * a second page break.
 */
export const ChapterBreak = Node.create({
  name: 'chapterBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-chapter-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-chapter-break': 'true', class: 'chf-chapter-break' })
    ]
  },

  addCommands() {
    return {
      insertChapterBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})

/**
 * The decorative centered rule used between chapters or major scene
 * transitions in print. Purely visual — it does not break the page, so it can
 * sit mid-page the way it does in a printed book.
 */
export const ChapterLine = Node.create({
  name: 'chapterLine',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-chapter-line]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-chapter-line': 'true', class: 'chf-chapter-line' })
    ]
  },

  addCommands() {
    return {
      insertChapterLine:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})
