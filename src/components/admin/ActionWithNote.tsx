import { useState } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * A moderation action that asks for a short reason first. The reason goes to
 * the person affected and into the security log, so it is worth a second.
 */
export default function ActionWithNote({
  label,
  confirmLabel,
  placeholder,
  onConfirm,
}: {
  label: string
  confirmLabel: string
  placeholder: string
  onConfirm: (note: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setProblem(null)
    try {
      await onConfirm(note.trim())
      setOpen(false)
      setNote('')
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-danger-500/40 px-2.5 py-1.5 text-xs text-danger-400 hover:bg-danger-500/10"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 300))}
        placeholder={placeholder}
        className="min-w-[12rem] flex-1 rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void confirm()}
        className="flex items-center gap-1.5 rounded-lg bg-danger-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {confirmLabel}
      </button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200">
        Keep
      </button>
      {problem && <p className="w-full text-xs text-danger-400">{problem}</p>}
    </div>
  )
}
