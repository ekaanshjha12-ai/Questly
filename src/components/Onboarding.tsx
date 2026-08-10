import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Swords, Check, Plus, X } from 'lucide-react'
import type { CharacterId, GoalCategory, NewGoalInput } from '../types'
import { CATEGORIES, detectCategory, getCategoryMeta } from '../data/categories'
import { GOAL_PRESETS, type GoalPreset } from '../data/goalPresets'
import { CHARACTERS } from '../data/gear'
import { RANKS } from '../data/ranks'
import Avatar3D from './Avatar3D'

interface Props {
  onComplete: (name: string, character: CharacterId, goals: NewGoalInput[]) => void
}

interface ChosenGoal {
  key: string
  title: string
  category: GoalCategory
  specHint: string
  detail: string
}

const STEPS = [0, 1, 2, 3]

function presetToChosen(preset: GoalPreset): ChosenGoal {
  return {
    key: preset.id,
    title: preset.title,
    category: preset.category,
    specHint: preset.specHint,
    detail: '',
  }
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [character, setCharacter] = useState<CharacterId>('female')
  const [chosen, setChosen] = useState<ChosenGoal[]>([])
  const [customDraft, setCustomDraft] = useState('')

  const chosenKeys = useMemo(() => new Set(chosen.map((g) => g.key)), [chosen])

  const grouped = useMemo(
    () =>
      CATEGORIES.filter((c) => c.id !== 'general')
        .map((cat) => ({ cat, presets: GOAL_PRESETS.filter((p) => p.category === cat.id) }))
        .filter((g) => g.presets.length > 0),
    [],
  )

  function togglePreset(preset: GoalPreset) {
    setChosen((prev) =>
      prev.some((g) => g.key === preset.id)
        ? prev.filter((g) => g.key !== preset.id)
        : [...prev, presetToChosen(preset)],
    )
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault()
    const title = customDraft.trim()
    if (!title) return
    setChosen((prev) => [
      ...prev,
      {
        key: `custom-${crypto.randomUUID()}`,
        title,
        category: detectCategory(title),
        specHint: 'e.g. how often, by when',
        detail: '',
      },
    ])
    setCustomDraft('')
  }

  function removeChosen(key: string) {
    setChosen((prev) => prev.filter((g) => g.key !== key))
  }

  function setDetail(key: string, detail: string) {
    setChosen((prev) => prev.map((g) => (g.key === key ? { ...g, detail } : g)))
  }

  function handleSubmit() {
    onComplete(
      name || 'Adventurer',
      character,
      chosen.map((g) => ({ title: g.title, category: g.category, detail: g.detail })),
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg rounded-2xl border border-ink-600 bg-ink-850/80 p-8 shadow-2xl backdrop-blur"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-ember-500 shadow-glow">
            <Swords className="h-6 w-6 text-ink-950" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide text-gold-300">Questly</h1>
            <p className="text-xs text-slate-400">Turn your goals into an adventure</p>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">What should we call you, hero?</h2>
              <p className="text-sm text-slate-400 mt-1">This is your character name on the quest log.</p>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoComplete="off"
              name="questly-hero-name"
              className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(1)}
            />
            <button
              onClick={() => setStep(1)}
              disabled={!name.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-ink-950 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Pick your hero</h2>
              <p className="text-sm text-slate-400 mt-1">This is who levels up as you complete quests.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CHARACTERS.map((c) => {
                const active = c.id === character
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacter(c.id)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition-colors ${
                      active
                        ? 'border-gold-500/60 bg-gold-500/10 shadow-glow'
                        : 'border-ink-600 bg-ink-800/60 hover:border-ink-500'
                    }`}
                  >
                    <Avatar3D modelUrl={c.modelUrl} accent={RANKS[0].color} level={1} size="md" hideBadge />
                    <span className="text-sm font-medium text-slate-100">{c.name}</span>
                    <span className="text-[11px] leading-tight text-slate-500 text-center">{c.blurb}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(0)}
                className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-slate-300 hover:bg-ink-800"
              >
                Back
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-ink-950 hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">What are you working toward, {name}?</h2>
              <p className="text-sm text-slate-400 mt-1">
                Pick as many as you like — each one becomes its own daily, weekly, and monthly quests.
              </p>
            </div>

            <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
              {grouped.map(({ cat, presets }) => (
                <div key={cat.id}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                    <span>{cat.icon}</span>
                    {cat.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((preset) => {
                      const active = chosenKeys.has(preset.id)
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => togglePreset(preset)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                            active
                              ? 'border-gold-500/60 bg-gold-500/10 text-gold-300'
                              : 'border-ink-600 bg-ink-800/60 text-slate-300 hover:border-ink-500'
                          }`}
                        >
                          {active && <Check className="h-3 w-3" strokeWidth={3} />}
                          {preset.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={addCustom} className="flex gap-2">
              <input
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                placeholder="Or add your own goal…"
                maxLength={80}
                autoComplete="off"
                name="questly-custom-goal"
                className="flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
              />
              <button
                type="submit"
                disabled={!customDraft.trim()}
                className="flex items-center gap-1 rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-slate-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-ink-800"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </form>

            {chosen.length > 0 && (
              <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
                  Chosen ({chosen.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chosen.map((g) => (
                    <span
                      key={g.key}
                      className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-2 py-1 text-xs text-slate-200"
                    >
                      {getCategoryMeta(g.category).icon} {g.title}
                      <button
                        type="button"
                        onClick={() => removeChosen(g.key)}
                        aria-label={`Remove ${g.title}`}
                        className="text-slate-500 hover:text-ember-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-slate-300 hover:bg-ink-800"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={chosen.length === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-ink-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Any specifics?</h2>
              <p className="text-sm text-slate-400 mt-1">
                Add detail to make each goal concrete — or skip and fill it in later.
              </p>
            </div>

            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {chosen.map((g) => (
                <div key={g.key} className="rounded-xl border border-ink-600 bg-ink-800/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-100">
                    <span>{getCategoryMeta(g.category).icon}</span>
                    {g.title}
                  </p>
                  <input
                    value={g.detail}
                    onChange={(e) => setDetail(g.key, e.target.value)}
                    placeholder={g.specHint}
                    maxLength={120}
                    autoComplete="off"
                    className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-gold-500/60"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-slate-300 hover:bg-ink-800"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-ink-950 hover:opacity-90"
              >
                Begin the Adventure
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center gap-1.5">
          {STEPS.map((i) => (
            <div key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-gold-500' : 'bg-ink-600'}`} />
          ))}
        </div>
      </motion.div>
    </div>
  )
}
