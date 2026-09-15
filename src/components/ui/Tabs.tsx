import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export interface TabItem<T extends string> {
  id: T
  label: string
  badge?: number
}

/**
 * Segmented tabs with arrow-key navigation. The selected tab carries a lit
 * underline that slides between them.
 */
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const layoutId = useRef(`tabs-${Math.random().toString(36).slice(2)}`).current

  // A row wider than the screen scrolls, so the chosen tab is brought into view.
  useEffect(() => {
    const index = tabs.findIndex((t) => t.id === value)
    const el = refs.current[index]
    const row = el?.parentElement
    if (!el || !row) return
    // Sideways only: the page itself must not move.
    const r = el.getBoundingClientRect()
    const b = row.getBoundingClientRect()
    if (r.left < b.left) row.scrollLeft -= b.left - r.left + 8
    else if (r.right > b.right) row.scrollLeft += r.right - b.right + 8
  }, [value, tabs])

  function onKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange(tabs[next].id)
  }

  return (
    <div role="tablist" aria-label={label} className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-1 ${className}`}>
      {tabs.map((tab, i) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative flex min-h-[36px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
              active ? 'text-slate-50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg border border-gold-500/40 bg-gold-500/10"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{tab.label}</span>
            {tab.badge ? (
              <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[9px] font-bold text-onAccent">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
