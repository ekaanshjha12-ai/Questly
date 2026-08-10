import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, Check, Lock, Map, Shirt, Camera } from 'lucide-react'
import type { AppState } from '../types'
import { CHARACTER_MODELS, findRank, isModelUnlocked, rankForLevel, nextRank } from '../data/ranks'
import { characterById } from '../data/gear'
import { appearanceFor } from '../lib/appearance'
import { xpToReachLevel, type LevelInfo } from '../lib/leveling'
import Avatar3D from './Avatar3D'
import RankRoadmap from './RankRoadmap'

interface Props {
  state: AppState
  levelInfo: LevelInfo
  onBuyModel: (modelId: string) => void
  onEquipModel: (modelId: string | null) => void
}

type Tab = 'roadmap' | 'shop'

export default function AvatarScreen({ state, levelInfo, onBuyModel, onEquipModel }: Props) {
  const [tab, setTab] = useState<Tab>('roadmap')
  const appearance = useMemo(() => appearanceFor(state), [state])
  const { level } = levelInfo
  const rank = rankForLevel(level)
  const upcoming = nextRank(level)
  const starter = characterById(state.player.character)

  const xpToNextRank = upcoming ? Math.max(0, xpToReachLevel(upcoming.minLevel) - state.player.xp) : 0

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-600 bg-ink-850/70 p-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Avatar3D
            modelUrl={appearance.modelUrl}
            accent={appearance.accent}
            level={level}
            size="lg"
            interactive
          />

          <div className="flex-1 text-center sm:text-left">
            <p className="font-display text-2xl font-bold text-slate-50">{state.player.name}</p>
            <p className="mt-0.5 text-sm" style={{ color: rank.color }}>
              {rank.icon} {rank.name} · Level {level}
            </p>
            <p className="mt-2 text-sm text-slate-400">{rank.blurb}</p>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-gold-300 sm:justify-start">
              <Coins className="h-4 w-4" />
              <span className="font-semibold">{state.player.coins}</span>
              <span className="text-xs text-slate-500">coins</span>
            </div>

            {levelInfo.awaitingProof && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 px-2.5 py-2 text-xs text-gold-300">
                <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Level {level + 1} is unlocked by XP. Verify{' '}
                  {levelInfo.proofsNeeded === 1 ? '1 more quest' : `${levelInfo.proofsNeeded} more quests`} with
                  a photo to claim it.
                </span>
              </p>
            )}

            {upcoming ? (
              <p className="mt-3 text-xs text-slate-500">
                <span className="text-slate-400">{xpToNextRank.toLocaleString()} XP</span> until{' '}
                <span style={{ color: upcoming.color }}>{upcoming.name}</span>
              </p>
            ) : (
              <p className="mt-3 text-xs" style={{ color: rank.color }}>
                Highest rank reached.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        {(
          [
            { id: 'roadmap' as const, label: 'Road to God', icon: Map },
            { id: 'shop' as const, label: 'Characters', icon: Shirt },
          ]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
                : 'border-ink-600 bg-ink-850/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'roadmap' ? (
        <section className="rounded-2xl border border-ink-600 bg-ink-850/40 p-4 sm:p-5">
          <RankRoadmap level={level} xp={state.player.xp} />
        </section>
      ) : (
        <section className="space-y-3">
          <StarterCard
            name={starter.name}
            blurb={starter.blurb}
            active={state.collection.active === null}
            onEquip={() => onEquipModel(null)}
          />

          {CHARACTER_MODELS.map((model) => {
            const owned = state.collection.unlocked.includes(model.id)
            const rankReached = isModelUnlocked(model, level)
            const affordable = state.player.coins >= model.price
            const active = state.collection.active === model.id
            const modelRank = findRank(model.rankId)

            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 rounded-2xl border p-3 ${
                  active ? 'border-gold-500/50 bg-gold-500/5' : 'border-ink-600 bg-ink-850/60'
                }`}
              >
                <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-900">
                  <img
                    src={model.previewUrl}
                    alt={model.name}
                    loading="lazy"
                    className={`h-full w-full object-contain ${rankReached ? '' : 'opacity-25 grayscale'}`}
                  />
                  {!rankReached && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Lock className="h-6 w-6 text-slate-500" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display font-semibold text-slate-100">{model.name}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: `${modelRank.color}22`, color: modelRank.color }}
                      >
                        {modelRank.name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{model.blurb}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    {owned ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Owned
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-gold-300">
                        <Coins className="h-3.5 w-3.5" />
                        {model.price}
                      </span>
                    )}

                    {owned ? (
                      <button
                        type="button"
                        onClick={() => onEquipModel(model.id)}
                        disabled={active}
                        className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-default disabled:border-gold-500/50 disabled:text-gold-300"
                      >
                        {active ? 'Worn' : 'Wear'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onBuyModel(model.id)}
                        disabled={!rankReached || !affordable}
                        className="rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:from-ink-700 disabled:to-ink-700 disabled:text-slate-500"
                      >
                        {!rankReached ? `Reach ${modelRank.name}` : affordable ? 'Buy' : 'Not enough coins'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </section>
      )}
    </div>
  )
}

function StarterCard({
  name,
  blurb,
  active,
  onEquip,
}: {
  name: string
  blurb: string
  active: boolean
  onEquip: () => void
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border p-3 ${
        active ? 'border-gold-500/50 bg-gold-500/5' : 'border-ink-600 bg-ink-850/60'
      }`}
    >
      <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-3xl">
        🧭
      </div>
      <div className="flex flex-1 flex-col justify-between self-stretch">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-semibold text-slate-100">{name}</p>
            <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] text-slate-400">Starter</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{blurb}</p>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onEquip}
            disabled={active}
            className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-default disabled:border-gold-500/50 disabled:text-gold-300"
          >
            {active ? 'Worn' : 'Wear'}
          </button>
        </div>
      </div>
    </div>
  )
}
