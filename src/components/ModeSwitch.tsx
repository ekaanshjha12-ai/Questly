import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'framer-motion'
import type { AppMode } from '../hooks/useMode'

/**
 * The switch between Focus and Social.
 *
 * Modelled on the reference: a panel's rounded corner with a groove running
 * around it, and a capsule knob that travels the groove. In Focus it rests
 * along the top edge in a light scene; switching sends it round the corner and
 * down the side, leaving a glowing trail, while the scene inside the switch
 * goes dark. Travelling the curve rather than sliding in a line is the point —
 * it makes the change of mode feel like turning a corner.
 *
 * Drawn in SVG and driven by one progress value from 0 (Focus) to 1 (Social):
 * the knob's position and angle are read off the groove path itself, so it
 * always sits exactly on the curve and faces along it.
 */

const SIZE = 120
/** The groove: a short straight run, a quarter circle round the corner, and a
 * short drop — the same path the knob, the trail and the groove all follow. */
const TRACK = 'M34 18 H50 A42 42 0 0 1 92 60 V76'

interface Props {
  mode: AppMode
  onToggle: (origin: { x: number; y: number }) => void
  /** Offers waiting — shown as a dot, so they are visible from Focus. */
  badge?: number
  size?: number
}

export default function ModeSwitch({ mode, onToggle, badge = 0, size = 64 }: Props) {
  const reduce = useReducedMotion()
  const progress = useMotionValue(mode === 'social' ? 1 : 0)
  const trackRef = useRef<SVGPathElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [length, setLength] = useState(0)
  const [pose, setPose] = useState({ x: 34, y: 18, angle: 0, t: mode === 'social' ? 1 : 0 })

  useLayoutEffect(() => {
    if (trackRef.current) setLength(trackRef.current.getTotalLength())
  }, [])

  // Read the knob's place and heading off the path for any progress value.
  const place = (t: number) => {
    const path = trackRef.current
    if (!path || !length) return
    const at = Math.max(0, Math.min(1, t)) * length
    const p = path.getPointAtLength(at)
    const ahead = path.getPointAtLength(Math.min(length, at + 0.5))
    const behind = path.getPointAtLength(Math.max(0, at - 0.5))
    const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI
    setPose({ x: p.x, y: p.y, angle, t })
  }

  useMotionValueEvent(progress, 'change', place)
  useEffect(() => place(progress.get()), [length])

  useEffect(() => {
    const target = mode === 'social' ? 1 : 0
    if (reduce) {
      progress.set(target)
      return
    }
    const controls = animate(progress, target, { type: 'spring', stiffness: 90, damping: 16, mass: 0.9 })
    return () => controls.stop()
  }, [mode, progress, reduce])

  const t = pose.t
  const social = mode === 'social'
  // The scene fades between the reference's two moods: pale in Focus, deep
  // navy in Social.
  const mix = (a: [number, number, number], b: [number, number, number]) =>
    `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`
  const bg = mix([226, 228, 231], [37, 45, 66])
  const panel = mix([244, 245, 247], [50, 60, 84])
  const groove = mix([210, 213, 218], [27, 33, 50])

  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={social}
      aria-label={social ? 'Social mode — switch to Focus' : 'Focus mode — switch to Social'}
      title={social ? 'Switch to Focus' : 'Switch to Social'}
      onClick={() => {
        const r = buttonRef.current?.getBoundingClientRect()
        onToggle(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 })
      }}
      className="relative shrink-0 overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      style={{
        width: size,
        height: size,
        background: bg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 0 rgba(0,0,0,0.25), 0 8px 18px -8px rgba(0,0,0,0.5)',
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="ms-panel-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="ms-trail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c3aed" stopOpacity="0.2" />
            <stop offset="0.55" stopColor="#c026d3" />
            <stop offset="1" stopColor="#f472b6" />
          </linearGradient>
          <filter id="ms-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <filter id="ms-knob-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.6" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <radialGradient id="ms-knob" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d4d7de" />
          </radialGradient>
        </defs>

        {/* The panel whose corner the switch wraps. */}
        <path d="M-2 40 H50 A20 20 0 0 1 70 60 V122 H-2 Z" fill={panel} />
        <path d="M-2 40 H50 A20 20 0 0 1 70 60 V122 H-2 Z" fill="url(#ms-panel-shade)" />

        {/* The groove, cut into the surface: a dark bed with a lit lower lip. */}
        <path ref={trackRef} d={TRACK} fill="none" stroke={groove} strokeWidth="19" strokeLinecap="round" />
        {/* Shade along the upper wall, where the cut blocks the light. */}
        <path d={TRACK} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth="15" strokeLinecap="round" transform="translate(0 -1.6)" />

        {/* The trail: the groove filled from the start up to the knob, once in
            a soft glow and once as the bright line on top. */}
        {length > 0 && (
          <>
            <path
              d={TRACK}
              fill="none"
              stroke="url(#ms-trail)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${length * t} ${length}`}
              filter="url(#ms-glow)"
              opacity={Math.min(1, t * 1.4)}
            />
            <path
              d={TRACK}
              fill="none"
              stroke="url(#ms-trail)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${length * t} ${length}`}
              opacity={Math.min(0.9, t * 1.2)}
            />
          </>
        )}

        {/* The knob, placed and turned along the groove. */}
        <g transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle})`} filter="url(#ms-knob-shadow)">
          <rect x="-17" y="-10.5" width="34" height="21" rx="10.5" fill="url(#ms-knob)" />
          <rect x="-17" y="-10.5" width="34" height="21" rx="10.5" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" />
          {/* Glowing end: green while focused, pink in social — the colour of
              where the knob is headed. */}
          <circle cx="8.5" cy="0" r="4.4" fill={social ? '#f472b6' : '#4ade80'} opacity="0.95" />
          <circle cx="8.5" cy="0" r="7.5" fill={social ? '#f472b6' : '#4ade80'} opacity="0.25" filter="url(#ms-glow)" />
          {/* The other end carries the mode's mark, kept upright as the knob turns. */}
          <g transform={`translate(-7 0) rotate(${-pose.angle})`}>
            <motion.g animate={{ opacity: social ? 0 : 1 }} transition={{ duration: 0.2 }}>
              {/* Focus: a target. */}
              <circle r="4.6" fill="none" stroke="#3f3f46" strokeWidth="1.3" />
              <circle r="1.6" fill="#3f3f46" />
            </motion.g>
            <motion.g animate={{ opacity: social ? 1 : 0 }} transition={{ duration: 0.2 }}>
              {/* Social: two people. */}
              <circle cx="-1.8" cy="-1.6" r="1.8" fill="#3f3f46" />
              <circle cx="2.6" cy="-1.2" r="1.5" fill="#3f3f46" opacity="0.75" />
              <path d="M-5 4.2 a3.2 3.2 0 0 1 6.4 0 Z" fill="#3f3f46" />
              <path d="M0.6 4.2 a2.6 2.6 0 0 1 4.8 0 Z" fill="#3f3f46" opacity="0.75" />
            </motion.g>
          </g>
        </g>
      </svg>

      {badge > 0 && (
        <span
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-gold-500 to-ember-500 px-1 text-[9px] font-bold text-onAccent"
          aria-label={`${badge} challenge offer${badge === 1 ? '' : 's'} waiting`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/**
 * The wash that carries the whole screen from one mode to the other: a circle
 * opening out from the switch, in the colour of the mode being entered.
 */
export function ModeWash({ origin, to, onMidpoint, onDone }: {
  origin: { x: number; y: number }
  to: AppMode
  onMidpoint: () => void
  onDone: () => void
}) {
  const reduce = useReducedMotion()

  // The screen underneath is swapped once the circle has covered it, which the
  // opening curve reaches a little after two-thirds of its run.
  useEffect(() => {
    if (reduce) {
      onMidpoint()
      onDone()
      return
    }
    const t = window.setTimeout(onMidpoint, 330)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  if (reduce) return null

  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
  const color =
    to === 'social'
      ? 'radial-gradient(circle at center, rgba(244,114,182,0.55), rgba(37,45,66,0.92) 45%)'
      : 'radial-gradient(circle at center, rgba(74,222,128,0.5), rgba(226,228,231,0.9) 45%)'

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[70]"
      style={{ background: color, backgroundPosition: `${origin.x}px ${origin.y}px` }}
      initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)`, opacity: 1 }}
      animate={{ clipPath: `circle(${radius}px at ${origin.x}px ${origin.y}px)`, opacity: [1, 1, 0] }}
      transition={{ clipPath: { duration: 0.45, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.8, times: [0, 0.55, 1] } }}
      onAnimationComplete={onDone}
    />
  )
}
