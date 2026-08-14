import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * The burst that fires when someone moves forward.
 *
 * Drawn as a handful of absolutely-positioned pieces rather than a canvas
 * library: forty divs animating transform and opacity stay on the compositor,
 * cost nothing to ship, and a confetti dependency for one moment of the app is
 * not worth the bytes.
 *
 * `pointer-events-none` throughout is load-bearing — a celebration that
 * swallows the tap dismissing it turns a reward into an obstacle.
 */

const COLOURS = [
  'rgb(var(--gold-400))',
  'rgb(var(--gold-500))',
  'rgb(var(--ember-400))',
  'rgb(var(--ember-500))',
  'rgb(var(--slate-100))',
]

interface Piece {
  id: number
  x: number
  driftX: number
  rise: number
  size: number
  delay: number
  spin: number
  colour: string
  round: boolean
}

function makePieces(count: number, seed: number): Piece[] {
  // Deterministic per burst so a re-render mid-animation does not reshuffle
  // every piece into a new position.
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: 8 + rand() * 84,
    driftX: (rand() - 0.5) * 120,
    rise: 120 + rand() * 220,
    size: 5 + rand() * 7,
    delay: rand() * 0.35,
    spin: (rand() - 0.5) * 720,
    colour: COLOURS[Math.floor(rand() * COLOURS.length)],
    round: rand() > 0.55,
  }))
}

export default function Celebration({
  /** Changing this restarts the burst. */
  burstKey,
  intensity = 'normal',
}: {
  burstKey: number
  intensity?: 'normal' | 'big'
}) {
  const still = useReducedMotion()
  const pieces = useMemo(
    () => makePieces(intensity === 'big' ? 44 : 26, burstKey || 1),
    [burstKey, intensity],
  )

  // Someone who asked for less motion gets no flying debris at all. There is no
  // "gentler confetti" — the honest answer is none.
  if (still) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={`${burstKey}-${p.id}`}
          className="absolute bottom-[28%]"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            background: p.colour,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ opacity: 0, y: 0, x: 0, rotate: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 1, 1, 0],
            // Up, then down — a burst that only rises reads as balloons.
            y: [0, -p.rise, -p.rise * 0.72],
            x: [0, p.driftX * 0.6, p.driftX],
            rotate: p.spin,
            scale: [0.6, 1, 1, 0.85],
          }}
          transition={{
            duration: 1.5 + p.delay,
            delay: p.delay,
            ease: [0.16, 0.9, 0.3, 1],
            times: [0, 0.22, 0.68, 1],
          }}
        />
      ))}
    </div>
  )
}
