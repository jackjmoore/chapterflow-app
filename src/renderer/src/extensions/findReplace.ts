import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  applyReplacementTemplate,
  buildSearchRegex,
  findMatchesInDoc,
  type Match,
  type SearchOptions
} from '../search/searchCore'

export interface FindReplaceStorage {
  query: string
  options: SearchOptions
  matches: Match[]
  currentIndex: number
  isRegexValid: boolean
}

const pluginKey = new PluginKey<DecorationSet>('findReplace')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setSearchQuery: (query: string, options: SearchOptions) => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrentMatch: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

function computeMatches(
  doc: PMNode,
  query: string,
  options: SearchOptions
): { matches: Match[]; isRegexValid: boolean } {
  if (!query) return { matches: [], isRegexValid: true }
  const regex = buildSearchRegex(query, options)
  if (!regex) return { matches: [], isRegexValid: false }
  return { matches: findMatchesInDoc(doc, regex), isRegexValid: true }
}

function buildDecorations(doc: PMNode, matches: Match[], currentIndex: number): DecorationSet {
  const decorations = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? 'search-match search-match-current' : 'search-match'
    })
  )
  return DecorationSet.create(doc, decorations)
}

export const FindReplace = Extension.create<Record<string, never>, FindReplaceStorage>({
  name: 'findReplace',

  addStorage() {
    return {
      query: '',
      options: { caseSensitive: false, wholeWord: false, useRegex: false },
      matches: [],
      currentIndex: -1,
      isRegexValid: true
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc, [], -1),
          apply(tr, old, _oldState, newState) {
            if (!tr.docChanged && !tr.getMeta(pluginKey)) return old

            const { matches, isRegexValid } = computeMatches(newState.doc, storage.query, storage.options)
            storage.matches = matches
            storage.isRegexValid = isRegexValid
            if (storage.currentIndex >= matches.length) {
              storage.currentIndex = matches.length > 0 ? 0 : -1
            }
            return buildDecorations(newState.doc, matches, storage.currentIndex)
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
      setSearchQuery:
        (query, options) =>
        ({ tr, dispatch, state }) => {
          this.storage.query = query
          this.storage.options = options
          const { matches, isRegexValid } = computeMatches(state.doc, query, options)
          this.storage.matches = matches
          this.storage.isRegexValid = isRegexValid
          this.storage.currentIndex = matches.length > 0 ? 0 : -1

          if (dispatch) {
            tr.setMeta(pluginKey, true)
            if (matches.length > 0) {
              const first = matches[0]
              tr.setSelection(TextSelection.create(tr.doc, first.from, first.to)).scrollIntoView()
            }
            dispatch(tr)
          }
          return true
        },

      findNext:
        () =>
        ({ tr, dispatch }) => {
          const { matches } = this.storage
          if (matches.length === 0) return false
          this.storage.currentIndex = (this.storage.currentIndex + 1) % matches.length
          if (dispatch) {
            const match = matches[this.storage.currentIndex]
            tr.setMeta(pluginKey, true)
              .setSelection(TextSelection.create(tr.doc, match.from, match.to))
              .scrollIntoView()
            dispatch(tr)
          }
          return true
        },

      findPrevious:
        () =>
        ({ tr, dispatch }) => {
          const { matches } = this.storage
          if (matches.length === 0) return false
          this.storage.currentIndex = (this.storage.currentIndex - 1 + matches.length) % matches.length
          if (dispatch) {
            const match = matches[this.storage.currentIndex]
            tr.setMeta(pluginKey, true)
              .setSelection(TextSelection.create(tr.doc, match.from, match.to))
              .scrollIntoView()
            dispatch(tr)
          }
          return true
        },

      replaceCurrentMatch:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const { matches, currentIndex, options } = this.storage
          if (currentIndex < 0 || currentIndex >= matches.length) return false
          const match = matches[currentIndex]
          if (dispatch) {
            const matchedText = state.doc.textBetween(match.from, match.to, '\n', '\n')
            const text = applyReplacementTemplate(replacement, match, matchedText, options.useRegex)
            tr.insertText(text, match.from, match.to).setMeta(pluginKey, true)
            dispatch(tr)
          }
          return true
        },

      replaceAllMatches:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const { matches, options } = this.storage
          if (matches.length === 0) return false
          if (dispatch) {
            const sorted = [...matches].sort((a, b) => b.from - a.from)
            for (const match of sorted) {
              const matchedText = state.doc.textBetween(match.from, match.to, '\n', '\n')
              const text = applyReplacementTemplate(replacement, match, matchedText, options.useRegex)
              tr.insertText(text, match.from, match.to)
            }
            tr.setMeta(pluginKey, true)
            dispatch(tr)
          }
          return true
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.query = ''
          this.storage.matches = []
          this.storage.currentIndex = -1
          if (dispatch) dispatch(tr.setMeta(pluginKey, true))
          return true
        }
    }
  }
})
