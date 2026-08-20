import type { Node as PMNode } from '@tiptap/pm/model'
import { isSceneBreakText } from '../../../shared/export'
import { groupSentences, normalizeForSpeech, splitSentences } from '../../../shared/speechText'

/**
 * One utterance's worth of speech, with everything needed to map playback
 * position back into the document.
 */
export interface SpeechChunk {
  /** Exactly the string handed to the engine. */
  text: string
  /** Document positions of this chunk's first and last sentence. */
  from: number
  to: number
  /** Sentence spans within `text`, mapped to document positions — used to
   *  highlight the sentence currently being spoken. */
  sentences: { charStart: number; charEnd: number; from: number; to: number }[]
  /** Silence after this chunk, in ms. */
  pauseAfterMs: number
  /** Index of the source block, so paragraph skip buttons can move a block at
   *  a time rather than a chunk at a time. */
  blockIndex: number
}

const PAUSE_SENTENCE_RUN = 90
const PAUSE_PARAGRAPH = 420
const PAUSE_HEADING = 650
const PAUSE_SCENE_BREAK = 1000

/**
 * Builds the speech plan from the LIVE editor document.
 *
 * `doc` is the editor's own ProseMirror state — the same object search, word
 * count, and the page-count measurement read. There is deliberately no second
 * extraction path (no re-parsing saved HTML, no cached copy), so what is read
 * aloud can never drift from what is on screen, including unsaved edits.
 */
export function buildSpeechPlan(doc: PMNode, fromPos = 0): SpeechChunk[] {
  const chunks: SpeechChunk[] = []
  let blockIndex = 0

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    blockIndex += 1

    // Positions inside a textblock start one past the node itself.
    const blockStart = pos + 1
    const rawText = node.textBetween(0, node.content.size, ' ', ' ')

    // A scene divider is punctuation for the eye. Reading "asterisk asterisk
    // asterisk" aloud is exactly the kind of formatting artifact to suppress —
    // it becomes a longer silence instead.
    if (isSceneBreakText(rawText)) {
      const previous = chunks[chunks.length - 1]
      if (previous) previous.pauseAfterMs = PAUSE_SCENE_BREAK
      return false
    }

    const normalized = normalizeForSpeech(rawText)
    if (!normalized) return false

    // Map normalized offsets back to document positions. Normalization only
    // collapses and substitutes, so walking both strings in step and matching
    // on letters/digits keeps the mapping honest without assuming equal length.
    const offsetToDocPos = buildOffsetMap(rawText, normalized, blockStart)

    const sentences = splitSentences(normalized)
    const isHeading = node.type.name === 'heading'
    const groups = groupSentences(sentences)

    groups.forEach((group, groupIndex) => {
      const charStart = group[0].start
      const charEnd = group[group.length - 1].end
      const text = normalized.slice(charStart, charEnd).trim()
      if (!text) return

      const lastGroup = groupIndex === groups.length - 1
      chunks.push({
        text,
        from: offsetToDocPos(charStart),
        to: offsetToDocPos(charEnd),
        sentences: group.map((sentence) => ({
          // Relative to this chunk's own text, which is what the engine reports.
          charStart: sentence.start - charStart,
          charEnd: sentence.end - charStart,
          from: offsetToDocPos(sentence.start),
          to: offsetToDocPos(sentence.end)
        })),
        pauseAfterMs: lastGroup ? (isHeading ? PAUSE_HEADING : PAUSE_PARAGRAPH) : PAUSE_SENTENCE_RUN,
        blockIndex
      })
    })

    return false
  })

  if (fromPos <= 0) return chunks
  // Jumping: keep from the chunk containing the caret onwards, so "read from
  // here" starts at the sentence you are looking at rather than the top.
  const startIndex = chunks.findIndex((chunk) => chunk.to >= fromPos)
  return startIndex <= 0 ? chunks : chunks.slice(startIndex)
}

/**
 * Returns a function mapping an offset in the normalized text to a document
 * position, by walking raw and normalized in step over their significant
 * characters. Falls back to the block start rather than throwing if the two
 * ever diverge — a wrong highlight is a cosmetic problem, a crash is not.
 */
function buildOffsetMap(raw: string, normalized: string, blockStart: number): (offset: number) => number {
  const significant = (c: string): boolean => /[\p{L}\p{N}]/u.test(c)
  const map: number[] = new Array(normalized.length + 1).fill(blockStart)

  let rawIndex = 0
  for (let n = 0; n < normalized.length; n++) {
    if (significant(normalized[n])) {
      while (rawIndex < raw.length && !significant(raw[rawIndex])) rawIndex++
      map[n] = blockStart + rawIndex
      if (rawIndex < raw.length) rawIndex++
    } else {
      map[n] = blockStart + Math.min(rawIndex, raw.length)
    }
  }
  map[normalized.length] = blockStart + Math.min(rawIndex, raw.length)

  return (offset: number) => map[Math.max(0, Math.min(offset, normalized.length))]
}

/** Chunks belonging to the block before/after the one at `index`. */
export function blockStartIndex(chunks: SpeechChunk[], currentIndex: number, direction: -1 | 1): number {
  const current = chunks[currentIndex]
  if (!current) return 0
  if (direction === 1) {
    const next = chunks.findIndex((c, i) => i > currentIndex && c.blockIndex !== current.blockIndex)
    return next === -1 ? currentIndex : next
  }
  // Back: to the start of this block, or the start of the previous one if
  // already there — the behaviour a "previous" control is expected to have.
  const firstOfCurrent = chunks.findIndex((c) => c.blockIndex === current.blockIndex)
  if (firstOfCurrent < currentIndex) return firstOfCurrent
  const previousBlock = chunks[firstOfCurrent - 1]?.blockIndex
  if (previousBlock === undefined) return 0
  return chunks.findIndex((c) => c.blockIndex === previousBlock)
}
