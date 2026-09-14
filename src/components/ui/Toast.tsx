import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  title: string
  body?: string
}

interface ToastApi {
  show: (toast: { tone?: Tone; title: string; body?: string }) => void
  error: (title: string, body?: string) => void
  success: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let seq = 0

/**
 * Short messages about the result of something the player did: saved,
 * refused, offline. They sit above the navigation, stack, and leave on their
 * own; errors stay a little longer. Read out politely to screen readers.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    ({ tone = 'info', title, body }: { tone?: Tone; title: string; body?: string }) => {
      seq += 1
      const id = seq
      setItems((list) => [...list.slice(-3), { id, tone, title, body }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6500 : 3800)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (title, body) => show({ tone: 'error', title, body }),
      success: (title, body) => show({ tone: 'success', title, body }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" className="toast-foot pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4">
          <AnimatePresence>
            {items.map((t) => {
              const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertTriangle : Info
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8 }}
                  className={`panel-raised pointer-events-auto flex w-full max-w-md items-start gap-3 px-4 py-3 ${
                    t.tone === 'error' ? 'border-danger-500/40' : t.tone === 'success' ? 'border-gold-500/40' : ''
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.tone === 'error' ? 'text-danger-400' : t.tone === 'success' ? 'text-gold-400' : 'text-info-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100">{t.title}</p>
                    {t.body && <p className="mt-0.5 text-xs text-slate-400">{t.body}</p>}
                  </div>
                  <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-1 text-slate-500 hover:text-slate-200">
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}

/** A readable message from anything thrown. */
export function messageOf(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}
