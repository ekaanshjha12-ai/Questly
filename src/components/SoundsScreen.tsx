import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Moon, Music2, Square, Volume1, Waves } from 'lucide-react'
import { MUSIC } from '../lib/music'
import { SOUNDS, type SoundGroup } from '../lib/noise'
import type { NoiseControls } from '../hooks/useNoise'
import { SoundsIcon } from './SectionIcons'

/**
 * Sounds: music and ambience for working to.
 *
 * Two layers that can play together — a music style and an ambient sound — so
 * lo-fi can run with rain behind it. Both carry on while the rest of the app is
 * used, and the header shows what is playing from anywhere.
 */

const SLEEP_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Off', minutes: null },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
]

const GROUPS: { id: SoundGroup; label: string }[] = [
  { id: 'nature', label: 'Nature' },
  { id: 'places', label: 'Places' },
  { id: 'noise', label: 'Noise' },
]

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Equaliser bars that move with the actual output level. Animated through refs
 * in a frame loop — driving them from React state would re-render the app
 * sixty times a second.
 */
export function LevelBars({ getLevel, active, bars = 4, className = '' }: { getLevel: () => number; active: boolean; bars?: number; className?: string }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const reduce = useReducedMotion()

  useEffect(() => {
    const set = (i: number, h: number) => {
      const el = refs.current[i]
      if (el) el.style.transform = `scaleY(${h})`
    }
    if (!active || reduce) {
      for (let i = 0; i < bars; i++) set(i, active ? 0.55 : 0.2)
      return
    }
    let frame = 0
    const smooth = new Array(bars).fill(0.2)
    const tick = (now: number) => {
      const level = getLevel()
      for (let i = 0; i < bars; i++) {
        // Each bar wobbles on its own phase, scaled by how loud it really is.
        const wobble = 0.55 + 0.45 * Math.sin(now / (170 + i * 53) + i * 1.7)
        const target = Math.min(1, 0.15 + level * 1.6 * wobble)
        smooth[i] += (target - smooth[i]) * 0.25
        set(i, smooth[i])
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, bars, getLevel, reduce])

  return (
    <span className={`flex items-end gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="block h-full w-[3px] origin-bottom rounded-full bg-gradient-to-t from-ember-500 to-gold-500"
          style={{ transform: 'scaleY(0.2)' }}
        />
      ))}
    </span>
  )
}

export default function SoundsScreen({ noise }: { noise: NoiseControls }) {
  const [group, setGroup] = useState<SoundGroup>('nature')
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (noise.sleepAt === null) {
      setRemaining(null)
      return
    }
    const update = () => setRemaining(noise.sleepAt! - Date.now())
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [noise.sleepAt])

  const musicDef = MUSIC.find((m) => m.id === noise.music) ?? null
  const ambienceDef = SOUNDS.find((s) => s.id === noise.ambience) ?? null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-50">
          <SoundsIcon className="h-5 w-5 text-gold-400" /> Sounds
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Music and ambience to focus, study or wind down to. It keeps playing while you use the rest of Questly.
        </p>
      </div>

      {/* --- now playing -------------------------------------------------------- */}
      <motion.section
        layout
        className={`rounded-2xl border p-4 transition-colors ${noise.playing ? 'border-gold-500/50 bg-gold-500/10' : 'border-ink-600 bg-ink-850'}`}
      >
        <div className="flex items-center gap-3">
          <span className="icon-well flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-800">
            <LevelBars getLevel={noise.getLevel} active={noise.playing} bars={5} className="h-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{noise.playing ? 'Now playing' : 'Nothing playing'}</p>
            <p className="truncate text-sm font-semibold text-slate-100">
              {noise.playing
                ? [musicDef && `${musicDef.icon} ${musicDef.name}`, ambienceDef && `${ambienceDef.icon} ${ambienceDef.name}`].filter(Boolean).join('  +  ')
                : 'Pick some music, a sound, or one of each'}
            </p>
            {remaining !== null && remaining > 0 && (
              <p className="flex items-center gap-1 text-[11px] text-slate-400">
                <Moon className="h-3 w-3" /> Stops in <span className="font-mono">{formatRemaining(remaining)}</span>
              </p>
            )}
          </div>
          {noise.playing && (
            <button
              type="button"
              onClick={noise.stop}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-ember-500/50 hover:text-ember-400"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </button>
          )}
        </div>
      </motion.section>

      {/* --- music -------------------------------------------------------------- */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Music2 className="h-3.5 w-3.5" /> Music
          </p>
          <p className="text-[10px] text-slate-500">Composed as it plays, never the same twice</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MUSIC.map((m) => {
            const active = noise.music === m.id
            return (
              <motion.button
                key={m.id}
                type="button"
                onClick={() => noise.toggleMusic(m.id)}
                aria-pressed={active}
                whileTap={{ scale: 0.97 }}
                className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors ${
                  active ? 'border-gold-500 bg-gold-500/15' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="text-2xl leading-none">{m.icon}</span>
                  {active ? (
                    <LevelBars getLevel={noise.getLevel} active className="h-4" />
                  ) : (
                    <span className="text-[10px] tabular-nums text-slate-500">{m.bpm} bpm</span>
                  )}
                </span>
                <span className={`text-sm font-semibold ${active ? 'text-slate-50' : 'text-slate-100'}`}>{m.name}</span>
                <span className="text-[11px] leading-snug text-slate-500">{m.blurb}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* --- ambience ------------------------------------------------------------ */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Waves className="h-3.5 w-3.5" /> Ambience
          </p>
          <div className="flex gap-0.5 rounded-lg border border-ink-600 bg-ink-800 p-0.5" role="group" aria-label="Kind of sound">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g.id)}
                aria-pressed={group === g.id}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  group === g.id ? 'bg-ink-600 text-slate-50' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SOUNDS.filter((s) => s.group === group).map((sound) => {
            const active = noise.ambience === sound.id
            return (
              <motion.button
                key={sound.id}
                type="button"
                onClick={() => noise.toggleAmbience(sound.id)}
                aria-pressed={active}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-gold-500 bg-gold-500/15' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
                }`}
              >
                <span className="text-lg leading-none">{sound.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-100">{sound.name}</span>
                  <span className="block truncate text-[10px] text-slate-500">{sound.blurb}</span>
                </span>
                {active && <LevelBars getLevel={noise.getLevel} active bars={3} className="h-3.5" />}
              </motion.button>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Plays on its own, or quietly under the music.</p>
      </section>

      {/* --- levels and timer ------------------------------------------------------ */}
      <section className="space-y-4 rounded-2xl border border-ink-600 bg-ink-850 p-4">
        <VolumeSlider label="Music volume" value={noise.volume.music} onChange={(v) => noise.setVolume('music', v)} dim={!noise.music} />
        <VolumeSlider label="Ambience volume" value={noise.volume.ambience} onChange={(v) => noise.setVolume('ambience', v)} dim={!noise.ambience} />

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Moon className="h-3 w-3" />
            Sleep timer
            {remaining !== null && remaining > 0 && <span className="ml-auto font-mono text-gold-400">{formatRemaining(remaining)}</span>}
          </p>
          <div className="flex gap-1">
            {SLEEP_OPTIONS.map((option) => {
              const on = option.minutes === null ? noise.sleepAt === null : false
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => noise.setSleepMinutes(option.minutes)}
                  className={`flex-1 rounded-lg border px-1 py-1.5 text-[11px] transition-colors ${
                    on ? 'border-gold-500/60 bg-gold-500/10 text-slate-50' : 'border-ink-600 bg-ink-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">Off means it keeps playing until you stop it.</p>
        </div>
      </section>
    </div>
  )
}

function VolumeSlider({ label, value, onChange, dim }: { label: string; value: number; onChange: (v: number) => void; dim: boolean }) {
  return (
    <label className={`block transition-opacity ${dim ? 'opacity-60' : ''}`}>
      <span className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Volume1 className="h-3.5 w-3.5" /> {label}
        </span>
        <span className="tabular-nums text-slate-500">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-[rgb(var(--ember-500))]"
      />
    </label>
  )
}
