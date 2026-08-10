import { useEffect, useMemo, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, Lock } from 'lucide-react'
import { RANKS, CHARACTER_MODELS, rankForLevel, rankIndex } from '../data/ranks'
import { xpToReachLevel } from '../lib/leveling'

interface Props {
  level: number
  xp: number
  onSelectRank?: (rankId: string) => void
}

/**
 * Progress along the road, 0–1, measured in XP rather than rank count so the
 * line creeps forward with every quest instead of jumping only on rank-up.
 */
function roadProgress(xp: number, level: number): number {
  const current = rankForLevel(level)
  const idx = rankIndex(current.id)
  if (idx >= RANKS.length - 1) return 1

  const next = RANKS[idx + 1]
  const startXp = xpToReachLevel(current.minLevel)
  const endXp = xpToReachLevel(next.minLevel)
  const within = endXp > startXp ? (xp - startXp) / (endXp - startXp) : 0
  const clamped = Math.max(0, Math.min(1, within))

  // Each completed segment is one step; add the fraction of the current one.
  return (idx + clamped) / (RANKS.length - 1)
}

function RankNode({
  rankId,
  index,
  state,
  onSelect,
}: {
  rankId: string
  index: number
  state: 'done' | 'current' | 'locked'
  onSelect?: () => void
}) {
  const rank = RANKS[index]
  const model = CHARACTER_MODELS.find((m) => m.rankId === rankId)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const reached = state !== 'locked'

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.06, ease: 'easeOut' }}
      className="relative flex items-center gap-4"
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        className="group relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 transition disabled:cursor-default"
        style={{
          borderColor: reached ? rank.color : '#2c3242',
          background: state === 'current' ? `${rank.color}22` : '#161a24',
          boxShadow: state === 'current' ? `0 0 24px -4px ${rank.color}` : 'none',
        }}
      >
        {state === 'current' && (
          <motion.span
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: rank.color }}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={`text-2xl ${reached ? '' : 'grayscale opacity-40'}`}>{rank.icon}</span>
        {state === 'done' && (
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: rank.color }}
          >
            <Check className="h-3 w-3 text-ink-950" strokeWidth={3} />
          </span>
        )}
      </button>

      <div className={`flex-1 rounded-xl border p-3 ${reached ? 'border-ink-600 bg-ink-850/70' : 'border-ink-700/60 bg-ink-900/40'}`}>
        <div className="flex items-center gap-2">
          <p
            className="font-display text-base font-semibold"
            style={{ color: reached ? rank.color : '#5b6479' }}
          >
            {rank.name}
          </p>
          <span className="text-[11px] text-slate-500">Lv {rank.minLevel}</span>
          {!reached && <Lock className="h-3 w-3 text-slate-600" />}
        </div>
        <p className={`mt-0.5 text-xs ${reached ? 'text-slate-400' : 'text-slate-600'}`}>{rank.blurb}</p>
        {model && (
          <p className={`mt-1.5 text-[11px] ${reached ? 'text-slate-500' : 'text-slate-600'}`}>
            Unlocks <span className="text-slate-400">{model.name}</span> · {model.price} coins
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default function RankRoadmap({ level, xp, onSelectRank }: Props) {
  const current = rankForLevel(level)
  const currentIdx = rankIndex(current.id)
  const progress = useMemo(() => roadProgress(xp, level), [xp, level])

  const currentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Centre the player's own rank. Adjusting the container's scrollTop directly
  // rather than scrollIntoView, which would also yank the whole page down.
  useEffect(() => {
    const box = scrollRef.current
    const node = currentRef.current
    if (!box || !node) return
    box.scrollTop = node.offsetTop - box.clientHeight / 2 + node.clientHeight / 2
  }, [])

  return (
    <div ref={scrollRef} className="relative max-h-[26rem] overflow-y-auto pr-1">
      {/* The road itself: a dim rail with an animated lit section on top. */}
      <div className="absolute left-8 top-8 bottom-8 w-1 -translate-x-1/2 rounded-full bg-ink-700" />
      <motion.div
        className="absolute left-8 top-8 w-1 -translate-x-1/2 rounded-full"
        style={{
          background: `linear-gradient(to bottom, ${RANKS[0].color}, ${current.color})`,
          transformOrigin: 'top',
        }}
        initial={{ height: 0 }}
        animate={{ height: `calc((100% - 4rem) * ${progress})` }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      <div className="relative space-y-5 pl-0">
        {RANKS.map((rank, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'locked'
          return (
            <div key={rank.id} ref={state === 'current' ? currentRef : undefined}>
              <RankNode
                rankId={rank.id}
                index={i}
                state={state}
                onSelect={onSelectRank ? () => onSelectRank(rank.id) : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
