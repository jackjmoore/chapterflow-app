import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
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

interface PaginationState {
  /** The break list as measured — describes the document at measurement
   *  time, and is kept only so a repeat measurement can be recognised. */
  breaks: PageBreak[]
  decorations: DecorationSet
  /** How many gaps `breaks` produced when built, so a gap that mapping has
   *  since dropped can be noticed by count. */
  built: number
}

export const paginationKey = new PluginKey<PaginationState>('pagination')

/** Turns a break list into gap widgets against the document it measured. */
function buildDecorations(doc: PMNode, breaks: PageBreak[]): { set: DecorationSet; built: number } {
  if (breaks.length === 0) return { set: DecorationSet.empty, built: 0 }

  // Block index → document position. The measured blocks are the top-level
  // children of the serialized HTML, which correspond one-to-one with the
  // document's top-level nodes (a list is one element and one node, not one
  // per item).
  const positions: number[] = []
  doc.forEach((_node, offset) => positions.push(offset))

  const decorations: Decoration[] = []
  for (const pageBreak of breaks) {
    const blockPos = positions[pageBreak.blockIndex]
    // A stale break list (measured before the last edit landed) can point
    // past the end of the document; skip rather than throw.
    if (blockPos === undefined || pageBreak.gapPx <= 0) continue

    // null = before the whole block. Otherwise the break falls at a line
    // boundary inside it, one position past the block's own opening token.
    const inline = pageBreak.charOffset !== null
    const pos = inline ? blockPos + 1 + (pageBreak.charOffset as number) : blockPos
    if (pos > doc.content.size) continue

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
        // side: -1 keeps the gap above the content it belongs to, and the
        // key lets ProseMirror reuse the node instead of recreating every
        // gap on each redraw.
        {
          side: -1,
          key: `page-gap-${pageBreak.blockIndex}-${pageBreak.charOffset ?? 'start'}-${Math.round(pageBreak.gapPx)}`
        }
      )
    )
  }
  return { set: DecorationSet.create(doc, decorations), built: decorations.length }
}

/**
 * Whether the gaps already on screen are the ones this break list describes.
 *
 * The pagination pass runs on a pause and on a max-wait while typing, and in
 * a long document most passes conclude that nothing moved. Dispatching the
 * identical list anyway would rebuild every widget and make ProseMirror
 * re-check every block's decorations — so the caller asks first. Two things
 * are compared: the list itself, and the number of gaps still standing,
 * because mapping through an edit can drop a gap whose position was deleted
 * while the recomputed list still legitimately contains it.
 */
export function pageBreaksUpToDate(state: EditorState, breaks: PageBreak[]): boolean {
  const current = paginationKey.getState(state)
  if (!current || current.breaks.length !== breaks.length) return false
  for (let i = 0; i < breaks.length; i += 1) {
    const a = current.breaks[i]
    const b = breaks[i]
    if (a.blockIndex !== b.blockIndex || a.charOffset !== b.charOffset || a.gapPx !== b.gapPx) return false
  }
  return current.decorations.find().length === current.built
}

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
 *
 * The widgets live in plugin state and are mapped through each transaction,
 * not rebuilt from the break list on every view update. Rebuilding meant
 * creating a few hundred widgets and re-checking a thousand blocks'
 * decorations per keystroke on a long manuscript — about 6ms of every
 * keystroke on 100,000 words, for gaps that had not moved. Mapping also
 * keeps a gap attached to the text it was measured against: pressing Enter
 * above a break used to shift every gap below onto the wrong block until the
 * next measurement caught up.
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
      new Plugin<PaginationState>({
        key: paginationKey,

        state: {
          init: () => ({ breaks: [], decorations: DecorationSet.empty, built: 0 }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as { breaks: PageBreak[] } | undefined
            if (meta) {
              const { set, built } = buildDecorations(tr.doc, meta.breaks)
              return { breaks: meta.breaks, decorations: set, built }
            }
            if (!tr.docChanged) return value
            return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
          }
        },

        props: {
          decorations(state) {
            return paginationKey.getState(state)?.decorations ?? DecorationSet.empty
          }
        }
      })
    ]
  }
})
