import { useMemo, useState } from 'react'
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, X } from 'lucide-react'
import type { CharacterId, GoalCategory, NewGoalInput } from '../../types'
import { game, type Appearance } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { CATEGORIES, detectCategory, getCategoryMeta } from '../../data/categories'
import { GOAL_PRESETS, type GoalPreset } from '../../data/goalPresets'
import { PATHS, type PathId } from '../../data/paths'
import { DEFAULT_APPEARANCE } from '../../art/hero'
import HeroSprite from '../../components/art/HeroSprite'
import AppearanceEditor from '../../components/art/AppearanceEditor'
import Button from '../../components/ui/Button'
import { messageOf, useToast } from '../../components/ui/Toast'

/**
 * A new player's first minutes: choose a path, make the hero, and set the
 * goals their quests are written from. The path and the look are saved to
 * the server as each step is left, so a reload mid-way keeps them; the goals
 * are saved with the notebook when the last step is confirmed.
 */

type Step = 'path' | 'hero' | 'goals'
const STEPS: Step[] = ['path', 'hero', 'goals']
const MAX_GOALS = 5

interface ChosenGoal {
  key: string
  title: string
  category: GoalCategory
  specHint: string
  detail: string
}

export default function OnboardingScreen({
  name,
  onComplete,
}: {
  name: string
  onComplete: (name: string, character: CharacterId, goals: NewGoalInput[]) => void
}) {
  const reduce = useReducedMotion()
  const toast = useToast()
  const { snapshot, setLook } = useGame()
  const [step, setStep] = useState<Step>('path')
  const [path, setPath] = useState<PathId | null>(() => {
    const saved = snapshot?.progress.flags.path
    return PATHS.some((p) => p.id === saved) ? (saved as PathId) : null
  })
  const [appearance, setAppearance] = useState<Appearance>(snapshot?.look.appearance ?? DEFAULT_APPEARANCE)
  const [chosen, setChosen] = useState<ChosenGoal[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [allIdeas, setAllIdeas] = useState(false)

  const index = STEPS.indexOf(step)
  const pathMeta = PATHS.find((p) => p.id === path) ?? null

  // The path's own categories first; the rest on request, since a Scholar
  // may well also want to run.
  const suggestions = useMemo(() => {
    const own = pathMeta?.categories.length ? pathMeta.categories : CATEGORIES.map((c) => c.id)
    const categories = allIdeas ? [...own, ...CATEGORIES.map((c) => c.id).filter((id) => !own.includes(id))] : own
    return categories
      .map((id) => ({ category: getCategoryMeta(id), presets: GOAL_PRESETS.filter((p) => p.category === id) }))
      .filter((group) => group.presets.length > 0)
  }, [pathMeta, allIdeas])
  const hasMoreIdeas = Boolean(pathMeta?.categories.length) && !allIdeas

  const chosenKeys = new Set(chosen.map((g) => g.key))

  function togglePreset(preset: GoalPreset) {
    setChosen((list) => {
      if (list.some((g) => g.key === preset.id)) return list.filter((g) => g.key !== preset.id)
      if (list.length >= MAX_GOALS) return list
      return [...list, { key: preset.id, title: preset.title, category: preset.category, specHint: preset.specHint, detail: '' }]
    })
  }

  function addCustom() {
    const title = draft.trim()
    if (!title || chosen.length >= MAX_GOALS) return
    setChosen((list) => [...list, { key: `custom-${crypto.randomUUID()}`, title: title.slice(0, 80), category: detectCategory(title), specHint: 'e.g. how often, by when', detail: '' }])
    setDraft('')
  }

  async function next() {
    if (busy) return
    if (step === 'path') {
      if (!path) return
      setBusy(true)
      try {
        await game.setPath(path)
      } catch {
        // Kept locally for this session; the path only shapes suggestions.
      } finally {
        setBusy(false)
      }
      setStep('hero')
    } else if (step === 'hero') {
      setBusy(true)
      try {
        const saved = await game.setAppearance(appearance)
        if (snapshot) setLook({ ...snapshot.look, appearance: saved.appearance })
        setStep('goals')
      } catch (err) {
        toast.error('Could not save your hero', messageOf(err, 'Check your connection and try again.'))
      } finally {
        setBusy(false)
      }
    } else if (chosen.length) {
      onComplete(
        name || 'Adventurer',
        appearance.body === 'a' ? 'male' : 'female',
        chosen.map((g) => ({ title: g.title, category: g.category, detail: g.detail.trim() || undefined })),
      )
    }
  }

  const canContinue = step === 'path' ? Boolean(path) : step === 'goals' ? chosen.length > 0 : true

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="safe-header mx-auto w-full max-w-lg flex-1 px-4 pb-4">
        <header className="mb-6">
          <p className="eyebrow">
            Step {index + 1} of {STEPS.length}
          </p>
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-gold-500' : 'bg-ink-700'}`} />
            ))}
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            {step === 'path' && (
              <>
                <h1 className="page-title">Choose your path</h1>
                <p className="mt-1 text-sm text-slate-400">Welcome, {name}. Where does your adventure start? You can take on any quest whichever you pick.</p>
                <div role="radiogroup" aria-label="Paths" className="mt-5 space-y-2.5">
                  {PATHS.map((p) => {
                    const active = p.id === path
                    const Icon = p.icon
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPath(p.id)}
                        className={`panel flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors ${active ? '!border-gold-500/70 bg-gold-500/10' : 'hover:border-ink-500'}`}
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink-600 bg-ink-950" style={{ color: p.accent }}>
                          <Icon className="h-6 w-6" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-xl font-bold text-slate-50">{p.name}</span>
                          <span className="block text-[13px] text-slate-400">{p.tagline}</span>
                        </span>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? 'border-gold-400 bg-gold-500 text-onAccent' : 'border-ink-500'}`}>
                          {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {step === 'hero' && (
              <>
                <h1 className="page-title">Create your hero</h1>
                <p className="mt-1 text-sm text-slate-400">This is who levels up as you complete quests. Everything you earn is worn here.</p>
                <div className="panel-raised relative mt-5 flex justify-center overflow-hidden py-4">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_65%,rgba(16,185,129,0.16),transparent_65%)]" />
                  <HeroSprite look={{ appearance, equipment: snapshot?.look.equipment ?? {} }} height={180} still={Boolean(reduce)} label="Your hero" />
                  {pathMeta && <span className="tag absolute left-3 top-3 border-gold-500/40 bg-gold-500/10 text-gold-300">{pathMeta.name}</span>}
                </div>
                <div className="mt-4">
                  <AppearanceEditor value={appearance} onChange={setAppearance} />
                </div>
              </>
            )}

            {step === 'goals' && (
              <>
                <h1 className="page-title">Set your goals</h1>
                <p className="mt-1 text-sm text-slate-400">Each goal writes its own daily, weekly and monthly quests. Pick up to {MAX_GOALS}; you can add more later.</p>

                <div className="mt-5 space-y-4">
                  {suggestions.map(({ category, presets }) => (
                    <div key={category.id}>
                      <p className="eyebrow mb-2 flex items-center gap-1.5">
                        <span aria-hidden>{category.icon}</span> {category.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => {
                          const active = chosenKeys.has(preset.id)
                          const full = !active && chosen.length >= MAX_GOALS
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              aria-pressed={active}
                              disabled={full}
                              onClick={() => togglePreset(preset)}
                              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-[13px] transition-colors disabled:opacity-40 ${
                                active ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600 bg-ink-900 text-slate-300 hover:border-ink-500'
                              }`}
                            >
                              {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                              {preset.title}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {hasMoreIdeas && (
                    <button type="button" onClick={() => setAllIdeas(true)} className="text-xs font-semibold text-gold-400 hover:text-gold-300">
                      More goal ideas from other paths
                    </button>
                  )}

                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      addCustom()
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Or write your own goal…"
                      maxLength={80}
                      autoComplete="off"
                      aria-label="Your own goal"
                      className="field"
                      disabled={chosen.length >= MAX_GOALS}
                    />
                    <Button type="submit" variant="secondary" icon={Plus} disabled={!draft.trim() || chosen.length >= MAX_GOALS}>
                      Add
                    </Button>
                  </form>

                  {chosen.length > 0 && (
                    <ul className="space-y-2" aria-label="Chosen goals">
                      {chosen.map((g) => (
                        <li key={g.key} className="panel px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span aria-hidden>{getCategoryMeta(g.category).icon}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{g.title}</span>
                            <button
                              type="button"
                              onClick={() => setChosen((list) => list.filter((x) => x.key !== g.key))}
                              aria-label={`Remove ${g.title}`}
                              className="rounded p-1 text-slate-500 hover:text-slate-200"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            value={g.detail}
                            onChange={(e) => setChosen((list) => list.map((x) => (x.key === g.key ? { ...x, detail: e.target.value } : x)))}
                            placeholder={`Specifics (optional) — ${g.specHint}`}
                            maxLength={120}
                            autoComplete="off"
                            aria-label={`Specifics for ${g.title}`}
                            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="sticky bottom-0 border-t border-ink-800 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg gap-2 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
          {index > 0 && (
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(STEPS[index - 1])} disabled={busy} aria-label="Back">
              <span className="sr-only sm:not-sr-only">Back</span>
            </Button>
          )}
          <Button
            block
            className="!min-h-[52px] flex-1 text-[15px]"
            loading={busy}
            disabled={!canContinue}
            icon={step === 'goals' ? Sparkles : undefined}
            trailingIcon={step === 'goals' ? undefined : ArrowRight}
            onClick={() => void next()}
          >
            {step === 'path' ? 'Choose path' : step === 'hero' ? 'This is my hero' : 'Begin the adventure'}
          </Button>
        </div>
      </footer>
    </div>
  )
}
