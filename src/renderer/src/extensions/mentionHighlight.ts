import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { findMatchesInDoc } from '../search/searchCore'
import { prepareMentionMatching, type MentionCandidate } from '../../../shared/mentionMatcher'

export interface MentionHighlightStorage {
  candidates: MentionCandidate[]
  regex: RegExp | null
  lookup: Map<string, string>
}

const pluginKey = new PluginKey<DecorationSet>('mentionHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mentionHighlight: {
      /** Replaces the candidate list (name + every alias, flattened across
       *  every Story Bible item) and forces an immediate recompute — called
       *  whenever the item list changes, and once on document switch. */
      setMentionCandidates: (candidates: MentionCandidate[]) => ReturnType
      /** Forces a recompute against the *current* candidates with no doc
       *  change — this is what the debounce timer calls after a typing pause. */
      rescanMentions: () => ReturnType
    }
  }
}

function buildDecorations(doc: PMNode, storage: MentionHighlightStorage): DecorationSet {
  if (!storage.regex) return DecorationSet.empty
  const matches = findMatchesInDoc(doc, storage.regex)
  const decorations: Decoration[] = []
  for (const m of matches) {
    const text = doc.textBetween(m.from, m.to, '\n', '\n')
    const itemId = storage.lookup.get(text.toLowerCase())
    if (!itemId) continue
    decorations.push(Decoration.inline(m.from, m.to, { class: 'mention-highlight', 'data-mention-item-id': itemId }))
  }
  return DecorationSet.create(doc, decorations)
}

/**
 * Highlights Story Bible item names/aliases in the manuscript — invisible
 * until hover (see index.css's .mention-highlight rule), never touching the
 * document model or undo history. Modeled on FindReplace's decoration
 * plugin, but with a deliberate divergence: FindReplace recomputes on every
 * keystroke (fine — Find is only active during a rare, deliberate action).
 * This would be active 100% of the time while writing, so `apply()` here
 * NEVER recomputes on a plain `tr.docChanged` — only on an explicit meta
 * flag, dispatched by the debounced `rescanMentions` command (see App.tsx's
 * onUpdate, mirroring schedulePageCount's exact debounce shape) or by
 * `setMentionCandidates` (dispatched immediately — a candidate-list change
 * or a document switch isn't the middle of continuous typing). Between
 * recomputes, decorations are just position-mapped through edits
 * (`old.map(...)`), not re-validated — they can transiently cover text
 * that's since changed, never land at the wrong position.
 */
export const MentionHighlight = Extension.create<Record<string, never>, MentionHighlightStorage>({
  name: 'mentionHighlight',

  addStorage() {
    return { candidates: [], regex: null, lookup: new Map() }
  },

  addProseMirrorPlugins() {
    const storage = this.storage

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old, _oldState, newState) {
            if (!tr.getMeta(pluginKey)) return old.map(tr.mapping, tr.doc)
            return buildDecorations(newState.doc, storage)
          }
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setMentionCandidates:
        (candidates) =>
        ({ tr, dispatch }) => {
          this.storage.candidates = candidates
          const { regex, lookup } = prepareMentionMatching(candidates)
          this.storage.regex = regex
          this.storage.lookup = lookup
          if (dispatch) dispatch(tr.setMeta(pluginKey, true))
          return true
        },

      rescanMentions:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(pluginKey, true))
          return true
        }
    }
  }
})
