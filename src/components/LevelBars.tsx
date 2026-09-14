import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Equaliser bars that move with the actual output level. Animated through refs
 * in a frame loop — driving them from React state would re-render the app
 * sixty times a second.
 */
export default function LevelBars({ getLevel, active, bars = 4, className = '' }: { getLevel: () => number; active: boolean; bars?: number; className?: string }) {
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
