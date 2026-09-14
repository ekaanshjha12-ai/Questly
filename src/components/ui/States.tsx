import type { ReactNode } from 'react'
import { AlertTriangle, RotateCw, type LucideIcon } from 'lucide-react'
import Button from './Button'

/** What to show when there is nothing yet — always with a way forward. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  art,
  className = '',
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  art?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-dashed border-ink-600 px-5 py-8 text-center ${className}`}>
      {art}
      {Icon && !art && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-ink-600 bg-ink-850 text-gold-400">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      )}
      <p className="font-display text-lg font-bold text-slate-100">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Placeholder lines while something loads, shaped like what is coming. */
export function LoadingState({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="panel h-[72px] animate-pulse opacity-70" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry, className = '' }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border border-danger-500/40 bg-danger-500/10 p-4 ${className}`}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-100">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" icon={RotateCw} className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
