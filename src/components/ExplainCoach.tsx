import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  ArrowLeft,
  Trash2,
  Check,
  AlertTriangle,
  Lightbulb,
  Target,
} from 'lucide-react'
import type { AppState, ExplainReport } from '../types'
import {
  ApiError,
  askExplainQuestions,
  requestExplainReport,
  type ProbeQuestion,
} from '../lib/api'
import { useSpeech } from '../hooks/useSpeech'

interface Props {
  state: AppState
  onAddReport: (report: Omit<ExplainReport, 'id' | 'createdAt'>) => void
  onDeleteReport: (reportId: string) => void
}

type Stage = 'topic' | 'explaining' | 'answering' | 'report'

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) {
    return 'The coach needs an API key on the server.'
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

function scoreColour(score: number): string {
  if (score >= 85) return '#8fe388'
  if (score >= 65) return '#7fd3f0'
  if (score >= 45) return '#e0c56b'
  if (score >= 25) return '#e09a5a'
  return '#e0625a'
}

/** Dictation button plus the textarea it fills. Typing and speaking both work,
 * and speech appends rather than replacing, so the two can be mixed. */
function VoiceField({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  rows: number
}) {
  const speech = useSpeech((chunk) => {
    onChange(value ? `${value} ${chunk}` : chunk)
  })

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          value={speech.interim ? `${value}${value ? ' ' : ''}${speech.interim}` : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
        />
        {speech.listening && (
          <span className="pointer-events-none absolute right-3 top-2.5 flex items-center gap-1.5 rounded-full bg-ember-500/20 px-2 py-0.5 text-[10px] text-ember-300">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-ember-400"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            Listening
          </span>
        )}
      </div>

      {speech.supported ? (
        <button
          type="button"
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition-colors ${
            speech.listening
              ? 'border-ember-500/50 bg-ember-500/10 text-ember-300'
              : 'border-ink-600 text-slate-300 hover:border-gold-500/50 hover:text-gold-300'
          }`}
        >
          {speech.listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {speech.listening ? 'Stop talking' : 'Say it out loud'}
        </button>
      ) : (
        <p className="text-[11px] text-slate-600">
          This browser has no speech input — type it instead.
        </p>
      )}

      {speech.error && <p className="text-[11px] text-ember-400">{speech.error}</p>}
    </div>
  )
}

function ReportView({ report, onDone }: { report: ExplainReport; onDone: () => void }) {
  const colour = scoreColour(report.score)
  const sections: { title: string; items: string[]; icon: typeof Check; tone: string }[] = [
    { title: 'What you had solid', items: report.strengths, icon: Check, tone: '#8fe388' },
    { title: 'What was missing', items: report.gaps, icon: Target, tone: '#e0c56b' },
    { title: 'What you had wrong', items: report.misconceptions, icon: AlertTriangle, tone: '#e0625a' },
    { title: 'Study next', items: report.nextSteps, icon: Lightbulb, tone: '#7fd3f0' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-5 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">{report.topic}</p>

        <div className="relative mx-auto mt-3 h-28 w-28">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2c3242" strokeWidth="9" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={colour}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42}
              initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - report.score / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-bold" style={{ color: colour }}>
              {report.score}
            </span>
            <span className="text-[10px] text-slate-500">out of 100</span>
          </div>
        </div>

        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-300">{report.verdict}</p>
      </div>

      {sections
        .filter((s) => s.items.length > 0)
        .map(({ title, items, icon: Icon, tone }) => (
          <div key={title} className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: tone }}>
              <Icon className="h-3.5 w-3.5" />
              {title}
            </p>
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: tone }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-ink-950 hover:opacity-90"
      >
        Explain something else
      </button>
    </div>
  )
}

export default function ExplainCoach({ state, onAddReport, onDeleteReport }: Props) {
  const [stage, setStage] = useState<Stage>('topic')
  const [topic, setTopic] = useState('')
  const [explanation, setExplanation] = useState('')
  const [questions, setQuestions] = useState<ProbeQuestion[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openReport, setOpenReport] = useState<ExplainReport | null>(null)

  function restart() {
    setStage('topic')
    setTopic('')
    setExplanation('')
    setQuestions([])
    setAnswers([])
    setError(null)
    setOpenReport(null)
  }

  async function getQuestions() {
    setBusy(true)
    setError(null)
    try {
      const { questions: list } = await askExplainQuestions(topic.trim(), explanation.trim())
      setQuestions(list)
      setAnswers(list.map(() => ''))
      setStage('answering')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function getReport() {
    setBusy(true)
    setError(null)
    try {
      const { report } = await requestExplainReport(
        topic.trim(),
        explanation.trim(),
        questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' })),
      )
      const saved: ExplainReport = {
        ...report,
        id: 'pending',
        topic: topic.trim(),
        createdAt: new Date().toISOString(),
      }
      onAddReport({ ...report, topic: topic.trim() })
      setOpenReport(saved)
      setStage('report')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'report' && openReport) {
    return <ReportView report={openReport} onDone={restart} />
  }

  if (openReport) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setOpenReport(null)}
          className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <ReportView report={openReport} onDone={() => setOpenReport(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4">
        <h3 className="font-display text-base font-semibold text-slate-100">Explain it back</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Teach a topic out loud from memory. You'll be questioned on it, then told how well you
          actually know it.
        </p>

        {stage === 'topic' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (topic.trim()) setStage('explaining')
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What will you explain?"
              maxLength={200}
              autoComplete="off"
              name="questly-explain-topic"
              className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
            />
            <button
              type="submit"
              disabled={!topic.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-40"
            >
              Start
            </button>
          </form>
        )}

        {stage === 'explaining' && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-400">
              Explain <span className="text-gold-300">{topic}</span> as if teaching someone who has
              never heard of it. Don't look anything up.
            </p>
            <VoiceField
              value={explanation}
              onChange={setExplanation}
              placeholder="Start talking, or type it here…"
              rows={7}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void getQuestions()}
                disabled={explanation.trim().length < 40 || busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? 'Thinking of questions…' : "I'm done — question me"}
              </button>
              <button
                type="button"
                onClick={restart}
                className="rounded-xl border border-ink-600 px-3 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
            {explanation.trim().length < 40 && explanation.length > 0 && (
              <p className="text-[11px] text-slate-600">Keep going — a couple of sentences at least.</p>
            )}
          </div>
        )}

        {stage === 'answering' && (
          <div className="mt-3 space-y-4">
            {questions.map((q, i) => (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
                <p className="text-sm font-medium text-slate-100">
                  <span className="mr-1.5 text-gold-400">{i + 1}.</span>
                  {q.question}
                </p>
                {q.probing && (
                  <p className="mb-2 mt-0.5 text-[11px] uppercase tracking-wide text-slate-600">
                    {q.probing}
                  </p>
                )}
                <VoiceField
                  value={answers[i] ?? ''}
                  onChange={(next) => setAnswers((prev) => prev.map((a, j) => (j === i ? next : a)))}
                  placeholder="Your answer…"
                  rows={3}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => void getReport()}
              disabled={busy || answers.every((a) => !a.trim())}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Marking…' : 'Get my report'}
            </button>
            <p className="text-center text-[11px] text-slate-600">
              Unanswered questions count against you — say what you can.
            </p>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {state.reports.length > 0 && stage === 'topic' && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Past attempts</p>
          {state.reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-850/60 px-3 py-2.5"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-sm font-bold"
                style={{ borderColor: scoreColour(report.score), color: scoreColour(report.score) }}
              >
                {report.score}
              </span>
              <button
                type="button"
                onClick={() => setOpenReport(report)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm text-slate-100">{report.topic}</span>
                <span className="block text-[11px] text-slate-500">
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteReport(report.id)}
                aria-label={`Delete the report for "${report.topic}"`}
                className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:text-ember-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
