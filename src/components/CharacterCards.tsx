import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Coins, Lock, Sparkles, Star } from 'lucide-react'
import type { AppState } from '../types'
import { CHARACTER_MODELS, RANKS, findRank, isModelUnlocked, rankIndex } from '../data/ranks'
import { CARD_MAX, barFill, cardFor } from '../data/lore'
import Avatar3D from './Avatar3D'

/**
 * The character shop, laid out like a collectible card.
 *
 * One large card for whichever character is selected, a grid of the rest
 * beneath it. The detail card carries everything the reference does — the
 * model, a rarity rating, a row of labelled attributes and a single action —
 * so the thing you are saving up for looks worth saving up for.
 */

/** Rarity is the rank's position on the ladder, so the stars and the price
 * agree with each other by construction rather than by being kept in sync. */
function rarityStars(rankId: string): number {
  const share = (rankIndex(rankId) + 1) / RANKS.length
  return Math.min(5, Math.max(1, Math.round(share * 5)))
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rarity ${count} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < count ? 'fill-gold-400 text-gold-400' : 'text-ink-500'}`}
          strokeWidth={1.5}
        />
      ))}
    </span>
  )
}

/** One labelled figure in the attribute strip. */
function Attr({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-xs font-semibold text-slate-100">{value}</p>
    </div>
  )
}

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-slate-200">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-700">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold-500 to-ember-500"
          initial={{ width: 0 }}
          animate={{ width: `${barFill(value, max) * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export default function CharacterCards({
  state,
  level,
  onBuy,
  onEquip,
}: {
  state: AppState
  level: number
  onBuy: (id: string) => void
  onEquip: (id: string | null) => void
}) {
  const [selectedId, setSelectedId] = useState(
    () => state.collection.active ?? CHARACTER_MODELS[0].id,
  )

  const selected = useMemo(
    () => CHARACTER_MODELS.find((m) => m.id === selectedId) ?? CHARACTER_MODELS[0],
    [selectedId],
  )

  const card = cardFor(selected.id)
  const rank = findRank(selected.rankId)
  const owned = state.collection.unlocked.includes(selected.id)
  const active = state.collection.active === selected.id
  const rankReached = isModelUnlocked(selected, level)
  const affordable = state.player.coins >= selected.price

  return (
    <div className="space-y-4">
      {/* --- the selected character ------------------------------------- */}
      <motion.section
        key={selected.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-850"
      >
        <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
          <div className="shrink-0">
            <Avatar3D
              modelUrl={selected.modelUrl}
              accent={rank.color}
              level={level}
              size="lg"
              interactive
              hideBadge
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-bold text-slate-50">{selected.name}</h3>
              {card && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: `${rank.color}22`, color: rank.color }}
                >
                  {card.archetype}
                </span>
              )}
            </div>
            <div className="mt-1">
              <Stars count={rarityStars(selected.rankId)} />
            </div>

            {card && (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">{card.lore}</p>
            )}

            {card && (
              <div className="mt-3 rounded-xl border border-ink-600 bg-ink-800 p-2.5">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gold-400">
                  <Sparkles className="h-3 w-3" />
                  {card.ability.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{card.ability.effect}</p>
              </div>
            )}
          </div>
        </div>

        {/* Attribute strip, as in the reference: labelled figures in a row. */}
        <div className="grid grid-cols-3 gap-3 border-t border-ink-700 px-4 py-3 sm:grid-cols-5 sm:px-5">
          <Attr label="Rank" value={rank.name} />
          <Attr label="Rarity" value={`${rarityStars(selected.rankId)} / 5`} />
          <Attr label="Unlocks at" value={`Level ${rank.minLevel}`} />
          <Attr label="Price" value={`${selected.price.toLocaleString()} coins`} />
          <Attr label="Status" value={owned ? (active ? 'Worn' : 'Owned') : rankReached ? 'Available' : 'Locked'} />
        </div>

        {card && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-ink-700 px-4 py-3 sm:px-5">
            <StatBar label="HP" value={card.hp} max={CARD_MAX.hp} />
            <StatBar label="Power" value={card.power} max={CARD_MAX.power} />
            <StatBar label="Focus" value={card.focus} max={CARD_MAX.focus} />
            <StatBar label="Resolve" value={card.resolve} max={CARD_MAX.resolve} />
          </div>
        )}

        <div className="border-t border-ink-700 p-3 sm:px-5">
          {owned ? (
            <button
              type="button"
              onClick={() => onEquip(selected.id)}
              disabled={active}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {active ? 'Currently worn' : 'Wear this one'}
            </button>
          ) : !rankReached ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2.5 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Reach {rank.name} — level {rank.minLevel} — to unlock
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onBuy(selected.id)}
              disabled={!affordable}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Coins className="h-4 w-4" />
              {affordable
                ? `Unlock for ${selected.price.toLocaleString()}`
                : `Need ${(selected.price - state.player.coins).toLocaleString()} more`}
            </button>
          )}
        </div>
      </motion.section>

      {/* --- the rest of the set ----------------------------------------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CHARACTER_MODELS.map((model) => {
          const isOwned = state.collection.unlocked.includes(model.id)
          const reached = isModelUnlocked(model, level)
          const chosen = model.id === selectedId
          return (
            <motion.button
              key={model.id}
              type="button"
              onClick={() => setSelectedId(model.id)}
              whileTap={{ scale: 0.97, y: 3 }}
              className={`rounded-2xl border p-2 text-left ${
                chosen
                  ? 'border-gold-500 bg-ink-800 ring-2 ring-gold-500/40'
                  : 'border-ink-600 bg-ink-850'
              }`}
            >
              <div className="relative overflow-hidden rounded-xl bg-ink-900">
                <img
                  src={model.previewUrl}
                  alt={model.name}
                  loading="lazy"
                  className={`h-20 w-full object-contain ${reached ? '' : 'opacity-25 grayscale'}`}
                />
                {!reached && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Lock className="h-4 w-4 text-slate-500" />
                  </span>
                )}
                {isOwned && (
                  <span className="absolute right-1 top-1 rounded-full bg-ink-950/80 p-0.5">
                    <Check className="h-3 w-3 text-gold-400" />
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-[11px] font-medium text-slate-200">{model.name}</p>
              <Stars count={rarityStars(model.rankId)} />
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
