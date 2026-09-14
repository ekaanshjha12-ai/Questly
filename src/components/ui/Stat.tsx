import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** A figure with its label — for the small stat tiles across the app. */
export default function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: LucideIcon
  tone?: 'neutral' | 'green' | 'gold'
  className?: string
}) {
  const accent = tone === 'green' ? 'text-gold-400' : tone === 'gold' ? 'text-reward-400' : 'text-slate-400'
  return (
    <div className={`panel px-3.5 py-3 ${className}`}>
      <p className="eyebrow flex items-center gap-1.5">
        {Icon && <Icon className={`h-3.5 w-3.5 ${accent}`} aria-hidden />}
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-slate-50 tabular-nums">{value}</p>
      {sub && <p className={`mt-1 text-[11px] ${tone === 'neutral' ? 'text-slate-500' : accent}`}>{sub}</p>}
    </div>
  )
}
