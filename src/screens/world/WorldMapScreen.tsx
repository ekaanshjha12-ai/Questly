import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, Check, CircleHelp, Flag, Lock, Minus, Moon, Plus, Sun, Sunrise, Sunset, Swords, Trophy } from 'lucide-react'
import { game, type WorldEvent, type WorldQuestOffer, type WorldRegion, type WorldView } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { Link, useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/Bars'
import { Sheet } from '../../components/ui/Sheet'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { RarityTag } from '../../components/ui/Tag'
import { messageOf, useToast } from '../../components/ui/Toast'
import { timeOfDay, type TimeOfDay } from '../../art/scene'
import { REGION_POINTS, UNCHARTED_POINT, WALKWAYS, WORLD_H, WORLD_W, worldImage, type RegionId } from '../../art/world'
import { REGION_META } from '../../data/world'
import { formatMinutes } from '../../lib/questFormat'

/**
 * The World Map: the Questly overworld with every region on it.
 *
 * The picture is drawn for the player's time of day; the markers over it are
 * real buttons. A region opens a sheet with where it leads, the quests it
 * offers this week and any event running there — or, while it is locked,
 * exactly what opens it. Locks, quests and events all come from the server.
 */

const TIME_LABEL: Record<TimeOfDay, { label: string; icon: typeof Sun }> = {
  morning: { label: 'Morning in Questly', icon: Sunrise },
  day: { label: 'Daylight over Questly', icon: Sun },
  evening: { label: 'Evening — the lanterns are lit', icon: Sunset },
  night: { label: 'Night — the city sleeps', icon: Moon },
}

function daysLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'ended'
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.max(1, Math.floor(ms / 3_600_000))
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}

export default function WorldMapScreen() {
  const { applyRewards, refreshQuests } = useGame()
  const [view, setView] = useState<WorldView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState<TimeOfDay>(() => timeOfDay())
  // Players can look at the world at another hour; it follows the clock otherwise.
  const [viewing, setViewing] = useState<TimeOfDay | null>(null)
  const time = viewing ?? clock
  const [openRegion, setOpenRegion] = useState<RegionId | 'uncharted' | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await game.world()
      setView(next)
      setError(null)
      if (next.rewards) applyRewards(next.rewards)
    } catch (err) {
      setError(messageOf(err, 'Could not load the world.'))
    }
  }, [applyRewards])

  useEffect(() => {
    void load()
    // The light moves on while the map is open.
    const t = window.setInterval(() => setClock(timeOfDay()), 5 * 60_000)
    return () => window.clearInterval(t)
  }, [load])

  const regions = useMemo(() => new Map((view?.regions ?? []).map((r) => [r.id as RegionId, r])), [view])
  const locked = useMemo(() => (view?.regions ?? []).filter((r) => !r.unlocked).map((r) => r.id as RegionId), [view])
  const activeEvent = view?.events.find((e) => e.state === 'active') ?? null
  const TimeIcon = TIME_LABEL[time].icon

  if (!view) {
    return (
      <div>
        <PageHeader title="World Map" subtitle={TIME_LABEL[time].label} />
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : <LoadingState lines={3} label="Unrolling the map" />}
      </div>
    )
  }

  const region = openRegion && openRegion !== 'uncharted' ? regions.get(openRegion) ?? null : null

  return (
    <div>
      <PageHeader
        title="World Map"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <TimeIcon className="h-3.5 w-3.5 text-reward-400" aria-hidden /> {TIME_LABEL[time].label}
          </span>
        }
      />

      {activeEvent && <EventBanner event={activeEvent} onOpen={() => setOpenRegion(activeEvent.region as RegionId)} />}

      <div role="radiogroup" aria-label="Time of day" className="mb-2 flex items-center justify-end gap-1">
        <button
          type="button"
          role="radio"
          aria-checked={viewing === null}
          onClick={() => setViewing(null)}
          className={`min-h-[32px] rounded-lg border px-2.5 text-[11px] font-semibold ${viewing === null ? 'border-gold-500/60 bg-gold-500/10 text-gold-300' : 'border-ink-700 text-slate-400 hover:text-slate-200'}`}
        >
          Now
        </button>
        {(Object.keys(TIME_LABEL) as TimeOfDay[]).map((t) => {
          const Icon = TIME_LABEL[t].icon
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={viewing === t}
              aria-label={`Show the world at ${t}`}
              onClick={() => setViewing(t)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${viewing === t ? 'border-gold-500/60 bg-gold-500/10 text-gold-300' : 'border-ink-700 text-slate-400 hover:text-slate-200'}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          )
        })}
      </div>

      <WorldCanvas
        time={time}
        locked={locked}
        regions={regions}
        events={view.events}
        onOpen={setOpenRegion}
      />

      <p className="mt-2 text-center text-[11px] text-slate-500">Drag to explore. Tap a place to visit it.</p>

      <section className="mt-5" aria-label="Regions">
        <h2 className="eyebrow mb-2.5">Regions</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {view.regions.map((r) => {
            const meta = REGION_META[r.id as RegionId]
            const Icon = meta.icon
            const open = r.quests.filter((q) => !q.quest).length
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenRegion(r.id as RegionId)} className="panel flex w-full items-center gap-3 px-3 py-2.5 text-left hover:border-ink-500">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-950" style={{ color: r.unlocked ? meta.accent : undefined }}>
                    {r.unlocked ? <Icon className="h-5 w-5" aria-hidden /> : <Lock className="h-4 w-4 text-slate-500" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${r.unlocked ? 'text-slate-100' : 'text-slate-400'}`}>{r.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.unlocked ? (open ? `${open} quest${open === 1 ? '' : 's'} to take this week` : meta.tagline) : r.requirements.filter((q) => !q.met).map((q) => q.label).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <Sheet
        open={Boolean(region)}
        onClose={() => setOpenRegion(null)}
        title={region?.name}
        subtitle={region ? REGION_META[region.id as RegionId].tagline : undefined}
      >
        {region && (
          <RegionDetail
            region={region}
            events={view.events.filter((e) => e.region === region.id)}
            onTaken={() => {
              void load()
              void refreshQuests().catch(() => undefined)
            }}
          />
        )}
      </Sheet>

      <Sheet open={openRegion === 'uncharted'} onClose={() => setOpenRegion(null)} title="The Uncharted Isles" subtitle="Beyond the mist" size="sm">
        <p className="text-sm leading-relaxed text-slate-300">
          Nobody has mapped these islands yet. New regions open here as Questly grows — when one does, it will appear on your map and in the Chronicle Log.
        </p>
      </Sheet>
    </div>
  )
}

/* --- the map itself ------------------------------------------------------------ */

function WorldCanvas({
  time,
  locked,
  regions,
  events,
  onOpen,
}: {
  time: TimeOfDay
  locked: RegionId[]
  regions: Map<RegionId, WorldRegion>
  events: WorldEvent[]
  onOpen: (id: RegionId | 'uncharted') => void
}) {
  const reduce = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(2)
  const image = useMemo(() => worldImage(time, locked), [time, locked])
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)

  // Open on the heart of the world.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const { x, y } = REGION_POINTS.focus_sanctum
    el.scrollLeft = Math.max(0, x * scale - el.clientWidth / 2)
    el.scrollTop = Math.max(0, y * scale - el.clientHeight / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !scrollRef.current) return
    drag.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop, moved: false }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || !scrollRef.current) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    scrollRef.current.scrollLeft = d.left - dx
    scrollRef.current.scrollTop = d.top - dy
  }
  function onPointerUp() {
    window.setTimeout(() => (drag.current = null), 0)
  }

  const eventRegions = new Set(events.filter((e) => e.state === 'active').map((e) => e.region))
  const walkers = time === 'night' ? 1 : time === 'evening' ? 3 : WALKWAYS.length

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="no-scrollbar relative h-[62dvh] max-h-[640px] min-h-[320px] cursor-grab overflow-auto rounded-2xl border border-ink-700 bg-[#1b2a1c] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        <div className="relative" style={{ width: WORLD_W * scale, height: WORLD_H * scale }}>
          <img src={image} alt="The Questly world map" draggable={false} className="pixelated absolute inset-0 h-full w-full select-none" />

          {/* Cloud shadows by day, fireflies by night. */}
          {!reduce && (time === 'day' || time === 'morning') && (
            <>
              <span className="pointer-events-none absolute left-[-20%] top-[30%] h-24 w-56 rounded-full bg-black/10 blur-2xl [animation:world-drift_80s_linear_infinite]" />
              <span className="pointer-events-none absolute left-[-30%] top-[65%] h-20 w-48 rounded-full bg-black/10 blur-2xl [animation:world-drift_110s_linear_infinite] [animation-delay:-40s]" />
            </>
          )}
          {!reduce &&
            time === 'night' &&
            [
              [30, 150], [60, 175], [300, 140], [320, 230], [190, 330], [340, 340], [455, 150], [20, 80], [200, 80], [120, 250],
            ].map(([x, y], i) => (
              <span
                key={i}
                className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-[#d8ff8a] shadow-[0_0_8px_3px_rgba(216,255,138,0.6)] [animation:world-firefly_4s_ease-in-out_infinite]"
                style={{ left: x * scale, top: y * scale, animationDelay: `${i * 0.43}s` }}
              />
            ))}

          {!reduce &&
            WALKWAYS.slice(0, walkers).map(([x0, y0, x1, y1], i) => (
              <motion.span
                key={i}
                aria-hidden
                className="pointer-events-none absolute"
                style={{ left: 0, top: 0 }}
                initial={{ x: x0 * scale, y: y0 * scale }}
                animate={{ x: [x0 * scale, x1 * scale], y: [y0 * scale, y1 * scale] }}
                transition={{ duration: Math.hypot(x1 - x0, y1 - y0) / 4, repeat: Infinity, repeatType: 'reverse', ease: 'linear', delay: i * 1.3 }}
              >
                <Walker scale={scale} tint={['#3a78e8', '#e84a5f', '#3ec1a8', '#f2c14e', '#9a6ad0'][i % 5]} lantern={time === 'night'} />
              </motion.span>
            ))}

          {(Object.keys(REGION_POINTS) as RegionId[]).map((id) => {
            const r = regions.get(id)
            if (!r) return null
            return (
              <RegionMarker
                key={id}
                region={r}
                scale={scale}
                event={eventRegions.has(id)}
                onOpen={() => onOpen(id)}
              />
            )
          })}

          <button
            type="button"
            onClick={() => onOpen('uncharted')}
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center focus-visible:outline-none"
            style={{ left: UNCHARTED_POINT.x * scale, top: (UNCHARTED_POINT.y - 8) * scale }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-400/50 bg-ink-950/80 text-slate-300">
              <CircleHelp className="h-4 w-4" aria-hidden />
            </span>
            <span className="mt-1 whitespace-nowrap rounded bg-ink-950/80 px-1.5 py-0.5 font-pixel text-[9px] uppercase tracking-wider text-slate-300">Uncharted</span>
          </button>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" onClick={() => setScale((s) => Math.min(3, s + 0.5))} aria-label="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-950/85 text-slate-200 hover:text-white">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(1, s - 0.5))} aria-label="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-950/85 text-slate-200 hover:text-white">
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Walker({ scale, tint, lantern }: { scale: number; tint: string; lantern: boolean }) {
  const px = Math.max(2, Math.round(scale))
  return (
    <span className="relative block" style={{ width: px, height: px * 4, transform: `translate(-50%, -100%)` }}>
      <span className="absolute left-0 top-0" style={{ width: px, height: px, background: '#f0c6a3' }} />
      <span className="absolute left-0" style={{ top: px, width: px, height: px * 2, background: tint }} />
      <span className="absolute left-0" style={{ top: px * 3, width: px, height: px, background: '#3a2a1c' }} />
      {lantern && <span className="absolute -right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#ffc45a] shadow-[0_0_10px_4px_rgba(255,196,90,0.55)]" />}
    </span>
  )
}

function RegionMarker({ region, scale, event, onOpen }: { region: WorldRegion; scale: number; event: boolean; onOpen: () => void }) {
  const id = region.id as RegionId
  const meta = REGION_META[id]
  const { x, y } = REGION_POINTS[id]
  const Icon = meta.icon
  const openQuests = region.quests.filter((q) => !q.quest).length
  const needLevel = region.requirements.find((r) => r.type === 'level' && !r.met)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${region.name}${region.unlocked ? '' : ', locked'}${openQuests ? `, ${openQuests} quests to take` : ''}${event ? ', event running' : ''}`}
      className="group absolute flex -translate-x-1/2 flex-col items-center focus-visible:outline-none"
      style={{ left: x * scale, top: (y + 18) * scale }}
    >
      <span className="relative">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-ink-950/85 shadow-lg transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-gold-400 ${region.unlocked ? '' : 'border-slate-500/60'}`}
          style={region.unlocked ? { borderColor: meta.accent, color: meta.accent } : undefined}
        >
          {region.unlocked ? <Icon className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4 text-slate-300" aria-hidden />}
        </span>
        {region.unlocked && openQuests > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-reward-400 font-pixel text-[9px] font-bold text-[#281a04] ring-2 ring-ink-950">!</span>
        )}
        {event && (
          <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#7a2fd0] text-white ring-2 ring-ink-950">
            <Flag className="h-3 w-3" aria-hidden />
          </span>
        )}
      </span>
      <span className="mt-1 whitespace-nowrap rounded bg-ink-950/85 px-1.5 py-0.5 font-pixel text-[9px] uppercase tracking-wider text-slate-100 shadow">
        {region.name}
      </span>
      {!region.unlocked && needLevel && (
        <span className="mt-0.5 whitespace-nowrap rounded bg-[#2a1b4a]/90 px-1.5 py-0.5 font-pixel text-[8px] uppercase tracking-wider text-[#d8c2ff]">LV {needLevel.target}</span>
      )}
    </button>
  )
}

/* --- events ------------------------------------------------------------------------ */

function EventBanner({ event, onOpen }: { event: WorldEvent; onOpen: () => void }) {
  const pct = Math.round((event.goal.current / Math.max(1, event.goal.target)) * 100)
  return (
    <button type="button" onClick={onOpen} className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-[#7a2fd0]/50 bg-[radial-gradient(ellipse_at_0%_0%,rgba(122,47,208,0.28),transparent_70%)] bg-ink-900 px-4 py-3 text-left">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#9a6ae8]/50 bg-[#2a1b4a] text-[#d8c2ff]">
        <Flag className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[#d8c2ff]">World event</span>
          <span className="text-[10px] text-slate-500">{daysLeft(event.endsAt)}</span>
        </span>
        <span className="block truncate font-display text-lg font-bold text-slate-50">{event.title}</span>
        <span className="mt-1 flex items-center gap-2">
          <ProgressBar percent={event.completed ? 100 : pct} tone="gold" className="flex-1" />
          <span className="shrink-0 text-[11px] tabular-nums text-slate-300">
            {event.completed ? 'Complete' : `${event.goal.current}/${event.goal.target}`}
          </span>
        </span>
      </span>
      <span className="shrink-0 font-display text-sm font-bold text-reward-300">+{event.xp} XP</span>
    </button>
  )
}

/* --- a region, opened ------------------------------------------------------------------ */

function RegionDetail({ region, events, onTaken }: { region: WorldRegion; events: WorldEvent[]; onTaken: () => void }) {
  const { navigate } = useRouter()
  const toast = useToast()
  const id = region.id as RegionId
  const meta = REGION_META[id]
  const Icon = meta.icon
  const [busy, setBusy] = useState<string | null>(null)

  async function take(offer: WorldQuestOffer) {
    setBusy(offer.key)
    try {
      await game.takeRegionQuest(region.id, offer.key)
      toast.success('Quest taken', `${offer.title} is on your board until the week ends.`)
      onTaken()
    } catch (err) {
      toast.error('Could not take that quest', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink-600 bg-ink-950" style={{ color: region.unlocked ? meta.accent : undefined }}>
          {region.unlocked ? <Icon className="h-6 w-6" aria-hidden /> : <Lock className="h-5 w-5 text-slate-400" aria-hidden />}
        </span>
        <p className="text-sm leading-relaxed text-slate-300">{meta.description}</p>
      </div>

      {!region.unlocked ? (
        <div className="rounded-xl border border-[#9a6ae8]/40 bg-[#2a1b4a]/40 p-3">
          <p className="flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-[0.14em] text-[#d8c2ff]">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Sealed
          </p>
          <p className="mt-1 text-xs text-slate-400">Mist and an old barrier hold this place. It opens when you have:</p>
          <ul className="mt-3 space-y-2.5">
            {region.requirements.map((r) => (
              <li key={r.label}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`flex items-center gap-1.5 ${r.met ? 'text-gold-300' : 'text-slate-200'}`}>
                    {r.met ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="h-3.5 w-3.5" />}
                    {r.label}
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {r.current}/{r.target}
                  </span>
                </div>
                <ProgressBar percent={(r.current / Math.max(1, r.target)) * 100} className="mt-1" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(meta.destination.to)}>{meta.destination.label}</Button>
          {meta.extra && (
            <Button variant="secondary" onClick={() => navigate(meta.extra!.to)}>
              {meta.extra.label}
            </Button>
          )}
        </div>
      )}

      {events.map((event) => (
        <div key={event.id} className="rounded-xl border border-[#7a2fd0]/40 bg-ink-950/60 p-3">
          <p className="flex items-center gap-1.5 font-pixel text-[9px] uppercase tracking-[0.14em] text-[#d8c2ff]">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {event.state === 'active' ? `Event · ${daysLeft(event.endsAt)}` : event.state === 'upcoming' ? `Coming ${new Date(event.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Event ended'}
          </p>
          <p className="mt-1 font-display text-base font-bold text-slate-50">{event.title}</p>
          <p className="text-xs text-slate-400">{event.blurb}</p>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar percent={event.completed ? 100 : (event.goal.current / Math.max(1, event.goal.target)) * 100} tone="gold" className="flex-1" />
            <span className="shrink-0 text-[11px] tabular-nums text-slate-300">
              {event.completed ? 'Complete' : `${event.goal.current}/${event.goal.target}`}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Goal: {event.goal.label}. Reward: <span className="text-reward-300">+{event.xp} XP</span>
          </p>
        </div>
      ))}

      {region.unlocked && (
        <section>
          <h3 className="eyebrow mb-2">This week’s quests here</h3>
          <ul className="space-y-2">
            {region.quests.map((offer) => (
              <li key={offer.key} className="panel px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-100">
                      {offer.title} <RarityTag rarity={offer.rarity} />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{offer.description}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {offer.progressKind === 'minutes'
                        ? `${formatMinutes(offer.target)} of timed focus`
                        : offer.progressKind === 'count'
                          ? `${offer.target} ${offer.unit ?? 'times'}, logged`
                          : offer.progressKind === 'milestones'
                            ? `${offer.target} steps`
                            : 'Tick it when done'}{' '}
                      · <span className="text-reward-300">+{offer.xp} XP</span>
                    </p>
                  </div>
                  <div className="shrink-0">
                    {offer.quest ? (
                      offer.quest.status === 'completed' ? (
                        <span className="tag border-gold-500/40 bg-gold-500/10 text-gold-300">
                          <Trophy className="h-3 w-3" /> Done
                        </span>
                      ) : (
                        <Link to={`/quests/${offer.quest.id}`} className="tag border-ink-500 text-slate-200 hover:border-gold-500/50">
                          On board · {offer.quest.progress.percent}%
                        </Link>
                      )
                    ) : (
                      <Button size="sm" icon={Swords} loading={busy === offer.key} onClick={() => void take(offer)}>
                        Take
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">New quests arrive here every Monday. Taken quests are due by the end of the week.</p>
        </section>
      )}
    </div>
  )
}
