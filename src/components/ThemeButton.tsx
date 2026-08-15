import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Moon, MonitorSmartphone, Sun } from 'lucide-react'
import { useTheme, type ThemeChoice } from '../hooks/useTheme'

const OPTIONS: { id: ThemeChoice; label: string; icon: typeof Sun; hint: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, hint: 'Warm paper' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Lamplight' },
  { id: 'system', label: 'System', icon: MonitorSmartphone, hint: 'Follow your device' },
]

/**
 * Theme control on the left rail, matching the planner and sound buttons.
 *
 * A panel of three rather than a cycling button: with dark, light and system
 * there is no natural order to cycle through, and tapping twice to get back to
 * where you were is worse than picking. The panel also has room to say what
 * "system" actually means, which an icon alone cannot.
 */
export default function ThemeButton() {
  const { choice, resolved, setChoice } = useTheme()
  const [open, setOpen] = useState(false)
  const Icon = choice === 'system' ? MonitorSmartphone : resolved === 'light' ? Sun : Moon

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Theme: ${choice === 'system' ? `following your device (${resolved})` : choice}`}
        aria-expanded={open}
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        // Stacked above the planner button on the same rail. See SIDE_BUTTON in
        // AiPlanner for why these sit in the corner on phones.
        className="fixed bottom-[10.5rem] left-0 z-40 flex h-14 w-11 items-center justify-center rounded-r-xl border border-l-0 border-ink-600 bg-ink-850/90 text-slate-400 shadow-lg transition-colors hover:text-gold-300 md:bottom-auto md:top-[calc(50%-5.75rem)]"
      >
        <Icon className="h-5 w-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              role="dialog"
              aria-label="Theme"
              className="fixed bottom-[10.5rem] left-12 z-50 w-48 rounded-2xl border border-ink-600 bg-ink-900 p-2 shadow-2xl md:bottom-auto md:top-[calc(50%-5.75rem)]"
            >
              {OPTIONS.map((option) => {
                const OptionIcon = option.icon
                const active = choice === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setChoice(option.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      active ? 'bg-gold-500/10 text-gold-300' : 'text-slate-300 hover:bg-ink-800'
                    }`}
                  >
                    <OptionIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{option.label}</span>
                      <span className="block text-[10px] text-slate-500">{option.hint}</span>
                    </span>
                    {active && <span className="text-[10px] font-semibold">ON</span>}
                  </button>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
