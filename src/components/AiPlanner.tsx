import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarRange,
  FileText,
  ListChecks,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from 'lucide-react'
import type { PlanItemInput, PlanPlacement } from '../types'
import { ApiError, askPlannerQuestions, generatePlan, type GeneratedPlan, type PlanDocument } from '../lib/api'
import { shiftDays } from '../lib/planner'
import { dailyKey } from '../lib/period'

interface Props {
  onApplyPlan: (items: PlanItemInput[]) => void
}

type Stage = 'goal' | 'questions' | 'review'

/**
 * Bottom corner on phones, side tab from md up.
 *
 * Vertically centred it sits squarely over the content column on a narrow
 * screen and hides whatever is behind it — a stat tile reading "0" because its
 * leading digit was covered is worse than having no button. The content column
 * only clears the side rails once the viewport passes about 760px, and the
 * bottom corner is the easiest place to reach one-handed anyway.
 *
 * Offset with `top` rather than `-translate-y-1/2`: framer writes its own
 * inline transform for the entry animation, which overrides the utility class.
 */
export const SIDE_BUTTON =
  'fixed bottom-24 left-0 z-40 flex h-14 w-11 items-center justify-center rounded-r-xl border border-l-0 shadow-lg transition-colors md:bottom-auto md:top-[calc(50%-1.75rem)] border-ink-600 bg-ink-850/90 text-slate-400 hover:text-gold-300'

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) {
    return 'The AI planner needs an API key on the server.'
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

function dateLabel(dayOffset: number): string {
  return shiftDays(new Date(), dayOffset).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Every horizon lands on a real day; only the daily items carry a time of day.
 * The planner views all read the same date, so one placement is visible in all
 * three rather than only in the view it was written for. */
function place(dayOffset: number, block?: string): PlanPlacement {
  return { date: dailyKey(shiftDays(new Date(), dayOffset)), ...(block ? { block } : {}) }
}

/** Kept in step with the server's allowlist. The input's `accept` is only a
 * convenience — the server re-checks the bytes, since a file picker can be
 * bypassed. */
const MAX_FILES = 3
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPT = '.pdf,.txt,.md,.markdown,.csv,application/pdf,text/plain,text/markdown,text/csv'

function mediaTypeFor(file: File): string | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (/\.(txt|md|markdown|csv)$/.test(name)) return 'text/plain'
  // Fall back to what the browser thinks, for files with no useful extension.
  if (file.type === 'application/pdf') return 'application/pdf'
  if (file.type.startsWith('text/')) return 'text/plain'
  return null
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      // Strip the `data:...;base64,` prefix — the API wants the payload alone.
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function planToItems(plan: GeneratedPlan): PlanItemInput[] {
  return [
    ...plan.todos.map((title) => ({ title })),
    ...plan.daily.map((d) => ({ title: d.title, placement: place(d.dayOffset, d.block) })),
    ...plan.weekly.map((w) => ({ title: w.title, placement: place(w.dayOffset) })),
    ...plan.monthly.map((m) => ({ title: m.title, placement: place(m.dayOffset) })),
  ]
}

function PlanSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof CalendarCheck
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" />
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function PlanRow({ title, date }: { title: string; date?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2">
      <span className="min-w-0 flex-1 text-xs text-slate-200">{title}</span>
      {date && <span className="shrink-0 text-[10px] text-slate-500">{date}</span>}
    </div>
  )
}

export default function AiPlanner({ onApplyPlan }: Props) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('goal')
  const [goal, setGoal] = useState('')
  const [detail, setDetail] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [plan, setPlan] = useState<GeneratedPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [files, setFiles] = useState<{ doc: PlanDocument; size: number }[]>([])

  function reset() {
    setStage('goal')
    setGoal('')
    setDetail('')
    setQuestions([])
    setAnswers([])
    setPlan(null)
    setError(null)
    setApplied(false)
    setFiles([])
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return
    setError(null)
    const next = [...files]

    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setError(`Attach at most ${MAX_FILES} files.`)
        break
      }
      const mediaType = mediaTypeFor(file)
      if (!mediaType) {
        setError(`${file.name}: only PDF and plain text files are accepted.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name}: too large. The limit is 5MB.`)
        continue
      }
      if (next.some((f) => f.doc.name === file.name)) continue
      try {
        next.push({ doc: { name: file.name, mediaType, data: await readAsBase64(file) }, size: file.size })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file.')
      }
    }
    setFiles(next)
  }

  const documents = files.map((f) => f.doc)

  function close() {
    setOpen(false)
    // Delay avoids the form visibly clearing while the panel is still animating out.
    setTimeout(reset, 200)
  }

  async function submitGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim() || busy) return
    setError(null)
    setBusy(true)
    try {
      const { questions: qs } = await askPlannerQuestions(goal.trim(), detail.trim() || undefined, documents)
      setQuestions(qs)
      setAnswers(qs.map(() => ''))
      setStage('questions')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswers(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const { plan: generated } = await generatePlan(
        goal.trim(),
        detail.trim() || undefined,
        questions.map((question, i) => ({ question, answer: answers[i] ?? '' })),
        documents,
      )
      setPlan(generated)
      setStage('review')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!plan) return
    onApplyPlan(planToItems(plan))
    setApplied(true)
  }

  const totalTasks = plan ? plan.todos.length + plan.daily.length + plan.weekly.length + plan.monthly.length : 0

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI planner"
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={SIDE_BUTTON}
      >
        <CalendarRange className="h-5 w-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="AI planner"
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-ink-700/60 px-5 py-3.5">
                <Sparkles className="h-4 w-4 text-gold-400" />
                <p className="flex-1 font-display text-sm font-semibold text-slate-100">AI Planner</p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {stage === 'goal' && (
                  <form onSubmit={submitGoal} className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">
                        What&apos;s the goal?
                      </label>
                      <input
                        autoFocus
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        placeholder="e.g. Run a 10K, learn conversational Spanish, launch my portfolio site"
                        maxLength={200}
                        autoComplete="off"
                        name="questly-plan-goal"
                        className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">
                        Anything else worth knowing? (optional)
                      </label>
                      <textarea
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        rows={2}
                        maxLength={400}
                        placeholder="Deadline, current level, time you have — whatever matters"
                        className="w-full resize-none rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">
                        Reference files (optional)
                      </label>
                      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                        A syllabus, course outline, training plan or reading list. The plan gets built around what
                        is actually in them. PDF or text, up to {MAX_FILES} files, 5MB each.
                      </p>

                      <div className="space-y-1.5">
                        {files.map((f, i) => (
                          <div
                            key={f.doc.name}
                            className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-950 px-3 py-2"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-mystic-400" />
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-200" title={f.doc.name}>
                              {f.doc.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(f.size)}</span>
                            <button
                              type="button"
                              onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              aria-label={`Remove ${f.doc.name}`}
                              className="shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:text-ember-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {files.length < MAX_FILES && (
                        <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-600 py-2.5 text-xs text-slate-400 transition-colors hover:border-gold-500/50 hover:text-gold-300">
                          <Paperclip className="h-3.5 w-3.5" />
                          {files.length ? 'Add another file' : 'Attach a file'}
                          <input
                            type="file"
                            multiple
                            accept={ACCEPT}
                            className="hidden"
                            onChange={(e) => {
                              void addFiles(e.target.files)
                              // Cleared so re-picking the same file still fires onChange.
                              e.target.value = ''
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {error && (
                      <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!goal.trim() || busy}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      {busy ? 'Thinking…' : 'Next'}
                    </button>
                  </form>
                )}

                {stage === 'questions' && (
                  <form onSubmit={submitAnswers} className="space-y-3">
                    <p className="text-xs text-slate-400">A few questions before writing the plan.</p>
                    {questions.map((q, i) => (
                      <div key={i}>
                        <label className="mb-1.5 block text-xs font-medium text-slate-300">{q}</label>
                        <textarea
                          value={answers[i] ?? ''}
                          onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
                          rows={2}
                          maxLength={500}
                          placeholder="Your answer…"
                          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                        />
                      </div>
                    ))}
                    {error && (
                      <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setStage('goal')}
                        aria-label="Back"
                        className="flex items-center gap-1.5 rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-ink-800"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Writing plan…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Write my plan
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {stage === 'review' && plan && (
                  <div className="space-y-4">
                    {applied ? (
                      <div className="rounded-xl border border-mystic-400/40 bg-mystic-500/10 px-3 py-2.5 text-xs text-mystic-200">
                        Added — {totalTasks} tasks are in your To-Do list, already placed on the Schedule tab.
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Review the plan, then add it. Dated tasks land directly on the Schedule tab.
                      </p>
                    )}

                    {plan.todos.length > 0 && (
                      <PlanSection title="Prep to-dos" icon={ListChecks}>
                        {plan.todos.map((t, i) => (
                          <PlanRow key={i} title={t} />
                        ))}
                      </PlanSection>
                    )}

                    {plan.daily.length > 0 && (
                      <PlanSection title="Daily" icon={CalendarCheck}>
                        {plan.daily.map((d, i) => (
                          <PlanRow key={i} title={d.title} date={dateLabel(d.dayOffset)} />
                        ))}
                      </PlanSection>
                    )}

                    {plan.weekly.length > 0 && (
                      <PlanSection title="Weekly" icon={CalendarCheck}>
                        {plan.weekly.map((w, i) => (
                          <PlanRow key={i} title={w.title} date={dateLabel(w.dayOffset)} />
                        ))}
                      </PlanSection>
                    )}

                    {plan.monthly.length > 0 && (
                      <PlanSection title="Monthly" icon={CalendarCheck}>
                        {plan.monthly.map((m, i) => (
                          <PlanRow key={i} title={m.title} date={dateLabel(m.dayOffset)} />
                        ))}
                      </PlanSection>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={close}
                        className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-ink-800"
                      >
                        {applied ? 'Done' : 'Discard'}
                      </button>
                      {!applied && (
                        <button
                          type="button"
                          onClick={apply}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent"
                        >
                          <CalendarCheck className="h-4 w-4" />
                          Add {totalTasks} tasks to my planner
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
