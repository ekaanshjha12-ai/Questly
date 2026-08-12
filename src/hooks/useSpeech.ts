import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Dictation via the Web Speech API.
 *
 * The API is not in `lib.dom`, so the shape it actually exposes is declared
 * here. Support is uneven: Chrome and Safari have it, Firefox does not, and
 * `supported` exists so callers can fall back to typing rather than showing a
 * button that silently does nothing.
 */
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
      }) => void)
    | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface Speech {
  supported: boolean
  listening: boolean
  /** Text confirmed so far this session. */
  transcript: string
  /** The phrase currently being spoken, before it settles. */
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  reset: () => void
}

/**
 * @param onFinalChunk called with each settled phrase, so a caller can append
 * dictation to text the user has already typed instead of replacing it.
 */
export function useSpeech(onFinalChunk?: (text: string) => void): Speech {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // Kept in a ref so restarting recognition doesn't need a fresh callback.
  const chunkRef = useRef(onFinalChunk)
  chunkRef.current = onFinalChunk
  // Distinguishes a deliberate stop from the browser ending the session itself,
  // which it does after a pause even with `continuous` set.
  const wantsToRun = useRef(false)

  useEffect(() => {
    return () => {
      wantsToRun.current = false
      recognitionRef.current?.stop()
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognition()
    if (!Ctor) {
      setError('Speech input is not supported in this browser.')
      return
    }

    setError(null)
    wantsToRun.current = true

    const recognition = new Ctor()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let settled = ''
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) settled += text
        else pending += text
      }
      setInterim(pending)
      if (settled) {
        setTranscript((prev) => (prev ? `${prev} ${settled.trim()}` : settled.trim()))
        chunkRef.current?.(settled.trim())
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked.'
          : 'Could not hear anything. Try again.',
      )
      wantsToRun.current = false
      setListening(false)
    }

    // Browsers end a session after a silence. Restarting keeps a long
    // explanation from being cut off mid-thought.
    recognition.onend = () => {
      setInterim('')
      if (!wantsToRun.current) {
        setListening(false)
        return
      }
      try {
        recognition.start()
      } catch {
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone.')
      setListening(false)
    }
  }, [])

  const stop = useCallback(() => {
    wantsToRun.current = false
    recognitionRef.current?.stop()
    setListening(false)
    setInterim('')
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setInterim('')
    setError(null)
  }, [])

  return {
    supported: Boolean(getRecognition()),
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    reset,
  }
}
