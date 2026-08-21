import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { PageBreak } from '../pagePreview'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pagination: {
      /** Applies freshly measured page breaks. Called from the same debounced
       *  pass that recomputes the page count. */
      setPageBreaks: (breaks: PageBreak[]) => ReturnType
    }
  }
}

export const paginationKey = new PluginKey<{ breaks: PageBreak[] }>('pagination')

/**
 * Pushes each page-starting block down onto its own sheet.
 *
 * The editor deliberately stays one contenteditable. Splitting the document
 * into a separate DOM element per page would break selection across pages,
 * copy/paste, and undo — ProseMirror owns one contiguous document, and the
 * paginated *appearance* has to be layered on rather than carved into it. So
 * the sheets are painted behind the text (see .page-sheet in index.css) and
 * this extension inserts the vertical gap that lands each block on the right
 * one.
 *
 * The gap is a widget decoration — a real, empty, non-editable div — rather
 * than a margin or padding on the block itself. Margins between adjacent
 * blocks collapse, so a `margin-top: 200px` next to an existing 12px
 * `margin-bottom` would add 188px, not 200px, and every page below would
 * drift by the difference. A widget occupies its height unconditionally.
 */
export const Pagination = Extension.create({
  name: 'pagination',

  addCommands() {
    return {
      setPageBreaks:
        (breaks: PageBreak[]) =>
        ({ tr, dispatch }) => {
          // A no-op transaction still has to reach the view for the
          // decorations to repaint, but it must not be added to the undo
          // history or mark the document dirty.
          if (dispatch) {
            tr.setMeta(paginationKey, { breaks })
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
        key: paginationKey,

        state: {
          init: () => ({ breaks: [] as PageBreak[] }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as { breaks: PageBreak[] } | undefined
            return meta ?? value
          }
        },

        props: {
          decorations(state) {
            const breaks = paginationKey.getState(state)?.breaks ?? []
            if (breaks.length === 0) return DecorationSet.empty

            // Block index → document position. The measured blocks are the
            // top-level children of the serialized HTML, which correspond
            // one-to-one with the document's top-level nodes (a list is one
            // element and one node, not one per item).
            const positions: number[] = []
            state.doc.forEach((_node, offset) => positions.push(offset))

            const decorations: Decoration[] = []
            for (const pageBreak of breaks) {
              const blockPos = positions[pageBreak.blockIndex]
              // A stale break list (measured before the last edit landed) can
              // point past the end of the document; skip rather than throw.
              if (blockPos === undefined || pageBreak.gapPx <= 0) continue

              // null = before the whole block. Otherwise the break falls at a
              // line boundary inside it, one position past the block's own
              // opening token.
              const inline = pageBreak.charOffset !== null
              const pos = inline ? blockPos + 1 + (pageBreak.charOffset as number) : blockPos
              if (pos > state.doc.content.size) continue

              decorations.push(
                Decoration.widget(
                  pos,
                  () => {
                    const gap = document.createElement('div')
                    gap.className = inline ? 'chf-page-gap chf-page-gap--inline' : 'chf-page-gap'
                    gap.style.height = `${pageBreak.gapPx}px`
                    gap.contentEditable = 'false'
                    gap.setAttribute('aria-hidden', 'true')
                    return gap
                  },
                  // side: -1 keeps the gap above the content it belongs to,
                  // and the key lets ProseMirror reuse the node instead of
                  // recreating every gap on each redraw.
                  {
                    side: -1,
                    key: `page-gap-${pageBreak.blockIndex}-${pageBreak.charOffset ?? 'start'}-${Math.round(pageBreak.gapPx)}`
                  }
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
