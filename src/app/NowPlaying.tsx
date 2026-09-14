import { createContext, useContext } from 'react'
import { Link, useRouter } from './router'
import LevelBars from '../components/LevelBars'

/**
 * What is playing, for the page header. Sound carries on across screens, so
 * every page shows it and one tap gets back to the controls.
 */

interface NowPlaying {
  label: string | null
  getLevel: () => number
}

const NowPlayingContext = createContext<NowPlaying>({ label: null, getLevel: () => 0 })

export const NowPlayingProvider = NowPlayingContext.Provider

export function useNowPlaying(): NowPlaying {
  return useContext(NowPlayingContext)
}

export function NowPlayingButton() {
  const { label, getLevel } = useNowPlaying()
  const { path } = useRouter()
  if (!label || path === '/sounds') return null
  return (
    <Link
      to="/sounds"
      title={`Playing ${label}`}
      aria-label={`Sounds: playing ${label}`}
      className="flex h-10 items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 transition-colors hover:bg-gold-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <LevelBars getLevel={getLevel} active className="h-3.5" />
      <span className="hidden max-w-[7rem] truncate text-[11px] font-semibold text-gold-300 sm:inline">{label}</span>
    </Link>
  )
}
