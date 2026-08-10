import { useCallback, useEffect, useRef, useState } from 'react'
import { createNoiseEngine, type NoiseEngine, type SoundId } from '../lib/noise'

const VOLUME_KEY = 'questly:noise-volume'

export interface NoiseControls {
  playing: SoundId | null
  volume: number
  /** Wall-clock time the sleep timer fires, or null when it runs indefinitely. */
  sleepAt: number | null
  toggle: (sound: SoundId) => void
  stop: () => void
  setVolume: (value: number) => void
  setSleepMinutes: (minutes: number | null) => void
  /** Read straight from the analyser. Deliberately not state — the meter is
   * animated with rAF so it never re-renders the app. */
  getLevel: () => number
}

/**
 * Owns the audio engine for the whole app. Lives above the view switch so sound
 * keeps playing while the user moves between tabs, and so a single AudioContext
 * is reused rather than one being created per screen.
 */
export function useNoise(): NoiseControls {
  const engineRef = useRef<NoiseEngine | null>(null)
  const [playing, setPlaying] = useState<SoundId | null>(null)
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [volume, setVolumeState] = useState(() => {
    const stored = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(stored) && stored > 0 ? Math.min(1, stored) : 0.35
  })

  function engine(): NoiseEngine {
    if (!engineRef.current) engineRef.current = createNoiseEngine()
    return engineRef.current
  }

  // Release the audio hardware when the app unmounts.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setPlaying(null)
    setSleepAt(null)
  }, [])

  const toggle = useCallback(
    (sound: SoundId) => {
      if (playing === sound) {
        stop()
        return
      }
      // play() resumes the context, which browsers only permit inside a user
      // gesture — this runs from a click, so the call chain stays synchronous
      // enough to satisfy that.
      void engine().play(sound)
      setPlaying(sound)
    },
    [playing, stop],
  )

  const setVolume = useCallback((value: number) => {
    setVolumeState(value)
    engineRef.current?.setVolume(value)
    try {
      localStorage.setItem(VOLUME_KEY, String(value))
    } catch {
      // Private mode — the volume just won't persist.
    }
  }, [])

  const setSleepMinutes = useCallback((minutes: number | null) => {
    setSleepAt(minutes === null ? null : Date.now() + minutes * 60_000)
  }, [])

  // A deadline plus one timeout, rather than counting ticks — a background tab
  // gets its timers throttled and a tick counter would drift badly over an hour.
  useEffect(() => {
    if (sleepAt === null || !playing) return
    const delay = sleepAt - Date.now()
    if (delay <= 0) {
      stop()
      return
    }
    const timer = window.setTimeout(stop, delay)
    return () => window.clearTimeout(timer)
  }, [sleepAt, playing, stop])

  const getLevel = useCallback(() => engineRef.current?.level() ?? 0, [])

  return { playing, volume, sleepAt, toggle, stop, setVolume, setSleepMinutes, getLevel }
}
