import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { AppMode } from '../hooks/useMode'

/**
 * The switch between Focus and Social.
 *
 * A two-sided pill with both modes always in view, so there is never any doubt
 * what it does or where it leads: the side you are on is a raised green key
 * with its name on it, the other is just its icon, waiting. Tapping the other
 * side slides the key across — it stretches as it goes, because the side it
 * lands on grows to fit its name — and the icon it lands on comes alive: the
 * target draws itself in and settles, the two people hop. On a phone there is
 * a tiny buzz as it lands. Tapping the side you are already on gives a small
 * nudge instead of doing nothing.
 *
 * New things waiting in Social (offers, messages, requests) show as a count on
 * the Social side while you are in Focus.
 */

const SPRING = { type: 'spring' as const, stiffness: 520, damping: 36, mass: 0.9 }

interface Props {
  mode: AppMode
  onChange: (mode: AppMode) => void
  badge?: number
}

export default function ModeToggle({ mode, onChange, badge = 0 }: Props) {
  const reduce = useReducedMotion()
  const [nudge, setNudge] = useState(0)

  function choose(next: AppMode) {
    if (next === mode) {
      setNudge((n) => n + 1)
      return
    }
    try {
      navigator.vibrate?.(12)
    } catch {
      // Not every browser allows it; the switch works the same without.
    }
    onChange(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Mode"
      className="relative flex shrink-0 items-center rounded-full bg-ink-800 p-[3px]"
      style={{ boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.22), inset 0 -1px 0 var(--clay-sheen)' }}
    >
      {(['focus', 'social'] as const).map((id) => {
        const active = mode === id
        const label = id === 'focus' ? 'Focus' : 'Social'
        return (
          <motion.button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={id === 'social' && badge > 0 && !active ? `${label}, ${badge} new` : label}
            title={active ? `${label} mode` : `Switch to ${label}`}
            onClick={() => choose(id)}
            whileTap={reduce ? undefined : { scale: 0.93 }}
            className={`relative flex h-9 items-center justify-center rounded-full px-2.5 text-xs font-bold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-500 ${
              active ? 'text-onAccent' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {active && (
              <motion.span
                layoutId={reduce ? undefined : 'mode-key'}
                key={`key-${nudge}`}
                initial={nudge && !reduce ? { scale: 1 } : false}
                animate={nudge && !reduce ? { scale: [1, 0.9, 1.04, 1] } : undefined}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-gradient-to-b from-gold-500 to-ember-500"
                style={{
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.12), 0 2px 0 var(--extrude-accent), 0 6px 14px -6px rgba(34,197,94,0.75)',
                }}
              />
            )}
            <span className="relative flex h-5 w-5 items-center justify-center">
              {id === 'focus' ? <FocusGlyph active={active} reduce={Boolean(reduce)} /> : <SocialGlyph active={active} reduce={Boolean(reduce)} />}
            </span>
            <AnimatePresence initial={false}>
              {active && (
                <motion.span
                  className="relative overflow-hidden whitespace-nowrap"
                  initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                  animate={{ width: 'auto', opacity: 1, marginLeft: 6 }}
                  exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                  transition={reduce ? { duration: 0 } : SPRING}
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
            {id === 'social' && badge > 0 && !active && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-gold-500 to-ember-500 px-1 text-[9px] font-bold leading-none text-onAccent ring-2 ring-ink-850"
              >
                {badge > 9 ? '9+' : badge}
              </motion.span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

/** A target: the ring draws itself in and the bullseye lands when Focus comes on. */
function FocusGlyph({ active, reduce }: { active: boolean; reduce: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <motion.circle
        cx="10"
        cy="10"
        r="7.2"
        initial={false}
        animate={active && !reduce ? { pathLength: [0.2, 1], rotate: [-90, 0] } : { pathLength: 1, rotate: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        style={{ originX: '50%', originY: '50%' }}
      />
      <circle cx="10" cy="10" r="3.6" opacity={0.7} />
      <motion.circle
        cx="10"
        cy="10"
        r="1.4"
        fill="currentColor"
        stroke="none"
        initial={false}
        animate={active && !reduce ? { scale: [0, 1.6, 1] } : { scale: 1 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        style={{ originX: '50%', originY: '50%' }}
      />
    </svg>
  )
}

/** Two people: they hop, one after the other, when Social comes on. */
function SocialGlyph({ active, reduce }: { active: boolean; reduce: boolean }) {
  const hop = (delay: number) =>
    active && !reduce ? { animate: { y: [0, -3, 0] }, transition: { duration: 0.35, delay, ease: 'easeOut' as const } } : { animate: { y: 0 } }
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <motion.g initial={false} {...hop(0.05)}>
        <circle cx="7.4" cy="6.8" r="2.7" />
        <path d="M2.6 16.4a4.8 4.8 0 0 1 9.6 0" />
      </motion.g>
      <motion.g initial={false} {...hop(0.16)} opacity={0.8}>
        <circle cx="13.6" cy="7.6" r="2.2" />
        <path d="M12.6 12.2a4 4 0 0 1 4.9 4.2" />
      </motion.g>
    </svg>
  )
}
