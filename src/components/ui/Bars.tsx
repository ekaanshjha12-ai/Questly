import { motion, useReducedMotion } from 'framer-motion'

/** An XP bar: a recessed track with a lit fill that grows into place. */
export function XpBar({
  value,
  max,
  tone = 'green',
  className = '',
  label,
}: {
  value: number
  max: number
  tone?: 'green' | 'gold'
  className?: string
  /** Read out by screen readers, e.g. "XP toward level 5". */
  label?: string
}) {
  const reduce = useReducedMotion()
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      className={`xp-track ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <motion.div
        className={`xp-fill ${tone === 'gold' ? 'xp-fill-gold' : ''}`}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** A thin progress bar for quests and stats. */
export function ProgressBar({ percent, tone = 'green', className = '', onParchment = false }: { percent: number; tone?: 'green' | 'gold'; className?: string; onParchment?: boolean }) {
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={`relative h-1.5 overflow-hidden rounded-full ${onParchment ? 'bg-parch-ink/15' : 'bg-ink-950'} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ${tone === 'gold' ? 'bg-reward-500' : onParchment ? 'bg-[#1f7a52]' : 'bg-gold-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
