import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { buildSpeechPlan, blockStartIndex, type SpeechChunk } from './readAloud/buildSpeech'

export interface ReadAloudVoice {
  uri: string
  name: string
  lang: string
  isDefault: boolean
}

export interface ReadAloudState {
  status: 'idle' | 'playing' | 'paused'
  /** Chunk index being spoken, and how many there are — the progress readout. */
  index: number
  total: number
}

interface UseReadAloudArgs {
  editor: Editor | null
  rate: number
  voiceUri: string | null
}

export interface ReadAloudController extends ReadAloudState {
  voices: ReadAloudVoice[]
  /** Reads the selection if there is one, otherwise from the caret onward. */
  start: (scope: 'selection' | 'fromCursor' | 'document') => void
  pause: () => void
  resume: () => void
  stop: () => void
  skip: (direction: -1 | 1) => void
}

/**
 * Read-aloud over the OS speech engine.
 *
 * Uses the platform's own voices through Chromium's speechSynthesis bridge —
 * SAPI on Windows. No model, no network, nothing leaves the machine.
 */
export function useReadAloud(args: UseReadAloudArgs): ReadAloudController {
  const { editor, rate, voiceUri } = args

  const [voices, setVoices] = useState<ReadAloudVoice[]>([])
  const [state, setState] = useState<ReadAloudState>({ status: 'idle', index: 0, total: 0 })

  const chunksRef = useRef<SpeechChunk[]>([])
  const indexRef = useRef(0)
  const cancelledRef = useRef(false)
  const gapTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const rateRef = useRef(rate)
  const voiceUriRef = useRef(voiceUri)

  useEffect(() => {
    rateRef.current = rate
  }, [rate])
  useEffect(() => {
    voiceUriRef.current = voiceUri
  }, [voiceUri])

  // Voices arrive asynchronously on first call — the list is empty until the
  // engine reports in, so both paths are needed.
  useEffect(() => {
    function readVoices(): void {
      const list = window.speechSynthesis?.getVoices() ?? []
      setVoices(
        list.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default }))
      )
    }
    readVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', readVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', readVoices)
  }, [])

  const clearHighlight = useCallback(() => {
    editor?.commands.setSpokenRange(null)
  }, [editor])

  const stop = useCallback(() => {
    cancelledRef.current = true
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
    window.speechSynthesis?.cancel()
    chunksRef.current = []
    indexRef.current = 0
    setState({ status: 'idle', index: 0, total: 0 })
    clearHighlight()
  }, [clearHighlight])

  /** Speaks chunk `i`, then schedules the next after that chunk's own pause. */
  const speakFrom = useCallback(
    (i: number) => {
      const chunks = chunksRef.current
      if (cancelledRef.current || i >= chunks.length) {
        if (!cancelledRef.current) stop()
        return
      }
      indexRef.current = i
      const chunk = chunks[i]
      setState({ status: 'playing', index: i, total: chunks.length })

      const utterance = new SpeechSynthesisUtterance(chunk.text)
      utterance.rate = rateRef.current
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === voiceUriRef.current)
      if (voice) utterance.voice = voice

      // Highlight the whole chunk up front, then narrow to each sentence as
      // the engine reports boundaries. If boundary events never fire (some
      // SAPI voices don't emit them), the chunk-level highlight still tracks
      // playback — degraded, not broken.
      editor?.commands.setSpokenRange({ from: chunk.from, to: chunk.to })

      utterance.onboundary = (event) => {
        if (cancelledRef.current) return
        const sentence = chunk.sentences.find(
          (s) => event.charIndex >= s.charStart && event.charIndex < s.charEnd
        )
        if (sentence) editor?.commands.setSpokenRange({ from: sentence.from, to: sentence.to })
      }

      utterance.onend = () => {
        if (cancelledRef.current) return
        gapTimerRef.current = setTimeout(() => speakFrom(i + 1), chunk.pauseAfterMs)
      }

      utterance.onerror = () => {
        if (cancelledRef.current) return
        // A failed chunk shouldn't end the reading — skip past it.
        gapTimerRef.current = setTimeout(() => speakFrom(i + 1), 120)
      }

      window.speechSynthesis.speak(utterance)
    },
    [editor, stop]
  )

  const start = useCallback(
    (scope: 'selection' | 'fromCursor' | 'document') => {
      if (!editor) return
      window.speechSynthesis?.cancel()
      cancelledRef.current = false

      const { from, to, empty } = editor.state.selection
      // The live document, not a re-parse of saved HTML — same object search
      // and the word count read, so unsaved edits are included.
      let plan = buildSpeechPlan(editor.state.doc, scope === 'document' ? 0 : from)

      if (scope === 'selection' && !empty) {
        plan = plan.filter((chunk) => chunk.from < to && chunk.to > from)
      }

      if (plan.length === 0) {
        setState({ status: 'idle', index: 0, total: 0 })
        return
      }
      chunksRef.current = plan
      speakFrom(0)
    },
    [editor, speakFrom]
  )

  const pause = useCallback(() => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
    window.speechSynthesis?.pause()
    setState((prev) => (prev.status === 'playing' ? { ...prev, status: 'paused' } : prev))
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis?.resume()
    setState((prev) => (prev.status === 'paused' ? { ...prev, status: 'playing' } : prev))
  }, [])

  /** Moves a whole block at a time — a paragraph is the unit a listener
   *  actually wants to re-hear, not a chunk. */
  const skip = useCallback(
    (direction: -1 | 1) => {
      const chunks = chunksRef.current
      if (chunks.length === 0) return
      const target = blockStartIndex(chunks, indexRef.current, direction)
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
      cancelledRef.current = true
      window.speechSynthesis?.cancel()
      cancelledRef.current = false
      speakFrom(target)
    },
    [speakFrom]
  )

  // Rate and voice only take effect on the next utterance — the engine cannot
  // retune one already in flight. Restarting the current chunk applies the
  // change immediately, which is what a rate slider is expected to do.
  const applyLive = useCallback(() => {
    if (state.status !== 'playing') return
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
    cancelledRef.current = true
    window.speechSynthesis?.cancel()
    cancelledRef.current = false
    speakFrom(indexRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, speakFrom])

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    applyLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, voiceUri])

  // Speech is a window-level resource: leaving it running after the component
  // goes away would keep talking with no way to stop it.
  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  return { ...state, voices, start, pause, resume, stop, skip }
}
