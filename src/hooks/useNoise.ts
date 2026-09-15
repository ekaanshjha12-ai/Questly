import { useCallback, useEffect, useRef, useState } from 'react'
import { createNoiseEngine, type Layer, type NoiseEngine, type SoundId } from '../lib/noise'
import type { MusicId } from '../lib/musicCatalog'

const VOLUME_KEYS: Record<Layer, string> = { ambience: 'questly:noise-volume', music: 'questly:music-volume' }
const DEFAULT_VOLUME: Record<Layer, number> = { ambience: 0.35, music: 0.55 }

export interface NoiseControls {
  /** The music playing, if any. */
  music: MusicId | null
  /** The ambient sound playing, if any — on its own or under the music. */
  ambience: SoundId | null
  /** Whether anything at all is playing. */
  playing: boolean
  volume: Record<Layer, number>
  /** Wall-clock time the sleep timer fires, or null when it runs indefinitely. */
  sleepAt: number | null
  toggleMusic: (id: MusicId) => void
  toggleAmbience: (id: SoundId) => void
  stop: () => void
  setVolume: (layer: Layer, value: number) => void
  setSleepMinutes: (minutes: number | null) => void
  /** Read straight from the analyser. Deliberately not state — meters are
   * animated with rAF so they never re-render the app. */
  getLevel: () => number
}

function storedVolume(layer: Layer): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEYS[layer]))
    return Number.isFinite(stored) && stored > 0 ? Math.min(1, stored) : DEFAULT_VOLUME[layer]
  } catch {
    return DEFAULT_VOLUME[layer]
  }
}

/**
 * Owns the audio engine for the whole app. Lives above the view switch so sound
 * keeps playing while the user moves between screens, and so a single
 * AudioContext is reused rather than one being created per screen.
 */
export function useNoise(): NoiseControls {
  const engineRef = useRef<NoiseEngine | null>(null)
  const [music, setMusic] = useState<MusicId | null>(null)
  const [ambience, setAmbience] = useState<SoundId | null>(null)
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [volume, setVolumeState] = useState<Record<Layer, number>>(() => ({
    music: storedVolume('music'),
    ambience: storedVolume('ambience'),
  }))
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  function engine(): NoiseEngine {
    if (!engineRef.current) {
      engineRef.current = createNoiseEngine()
      engineRef.current.setVolume('music', volumeRef.current.music)
      engineRef.current.setVolume('ambience', volumeRef.current.ambience)
    }
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
    engineRef.current?.stopMusic()
    engineRef.current?.stopAmbience()
    setMusic(null)
    setAmbience(null)
    setSleepAt(null)
  }, [])

  // play() resumes the context, which browsers only permit inside a user
  // gesture — these run from a click, so the call chain stays synchronous
  // enough to satisfy that.
  const current = useRef({ music, ambience })
  current.current = { music, ambience }

  const toggleMusic = useCallback((id: MusicId) => {
    if (current.current.music === id) {
      engineRef.current?.stopMusic()
      setMusic(null)
      return
    }
    void engine().playMusic(id)
    setMusic(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleAmbience = useCallback((id: SoundId) => {
    if (current.current.ambience === id) {
      engineRef.current?.stopAmbience()
      setAmbience(null)
      return
    }
    void engine().playAmbience(id)
    setAmbience(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setVolume = useCallback((layer: Layer, value: number) => {
    setVolumeState((v) => ({ ...v, [layer]: value }))
    engineRef.current?.setVolume(layer, value)
    try {
      localStorage.setItem(VOLUME_KEYS[layer], String(value))
    } catch {
      // Private mode — the volume just won't persist.
    }
  }, [])

  const setSleepMinutes = useCallback((minutes: number | null) => {
    setSleepAt(minutes === null ? null : Date.now() + minutes * 60_000)
  }, [])

  const playing = music !== null || ambience !== null

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

  return { music, ambience, playing, volume, sleepAt, toggleMusic, toggleAmbience, stop, setVolume, setSleepMinutes, getLevel }
}
