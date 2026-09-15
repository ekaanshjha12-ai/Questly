import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useReducedMotion } from 'framer-motion'
import { CalendarClock, Castle, Check, Compass, Flag, Lock, Minus, Moon, Plus, Sun, Sunrise, Sunset, Swords, Trophy, type LucideIcon } from 'lucide-react'
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
import { timeOfDay, type TimeOfDay } from '../../lib/timeOfDay'
import { GUILD_POINT, HORIZON_POINT, NIGHT_LIGHTS, REGION_META, WORLD_H, WORLD_W, type RegionId } from '../../data/world'
import { clubHall } from '../../data/buildings'
import type { WorldClub } from '../../lib/api'
import { formatMinutes } from '../../lib/questFormat'
import worldArt from '../../assets/world/questly-world.webp'
import worldArtSmall from '../../assets/world/questly-world-768.webp'
import worldArtTiny from '../../assets/world/questly-world-tiny.webp'

/**
 * The World Map: the Questly archipelago with every region on it.
 *
 * The painting is lit for the player's time of day and locked lands lie under
 * mist; the labels over it are real buttons. A region opens a sheet with where
 * it leads, the quests it offers this week and any event running there — or,
 * while it is locked, exactly what opens it. Locks, quests and events all come
 * from the server.
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
  const [openRegion, setOpenRegion] = useState<RegionId | 'guild' | 'horizon' | null>(null)
  const { navigate } = useRouter()

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

  const region = openRegion && openRegion !== 'guild' && openRegion !== 'horizon' ? regions.get(openRegion) ?? null : null

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
        regions={regions}
        events={view.events}
        clubs={view.clubs}
        onOpen={setOpenRegion}
      />

      <p className="mt-2 text-center text-[11px] text-slate-500">Drag to explore. Tap a place to visit it.</p>

      <section className="mt-5" aria-label="Regions">
        <h2 className="eyebrow mb-2.5">Regions</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[...view.regions].sort((a, b) => regionRank(a.id) - regionRank(b.id)).map((r) => {
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
                    <span className={`block truncate text-sm font-semibold ${r.unlocked ? 'text-slate-100' : 'text-slate-400'}`}>{meta.name}</span>
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
        title={region ? REGION_META[region.id as RegionId].name : undefined}
        subtitle={region ? REGION_META[region.id as RegionId].tagline : undefined}
      >
        {region && (
          <RegionDetail
            region={region}
            clubs={view.clubs[region.id] ?? []}
            events={view.events.filter((e) => e.region === region.id)}
            onTaken={() => {
              void load()
              void refreshQuests().catch(() => undefined)
            }}
          />
        )}
      </Sheet>

      <Sheet open={openRegion === 'guild'} onClose={() => setOpenRegion(null)} title="The Grand Guild" subtitle="All paths meet here" size="sm">
        <p className="text-sm leading-relaxed text-slate-300">
          The great hall at the heart of Questly. Every road on the map leads here: quests are handed out, rivals are matched, and clubs gather before raising halls of their own across the world.
        </p>
        <div className="mt-4 grid gap-2">
          <Button onClick={() => navigate('/quests')}>Open the Quest Board</Button>
          <Button variant="secondary" onClick={() => navigate('/clubs')}>
            Find a club
          </Button>
          <Button variant="secondary" onClick={() => navigate('/challenges')}>
            Duels
          </Button>
        </div>
      </Sheet>

      <Sheet open={openRegion === 'horizon'} onClose={() => setOpenRegion(null)} title="Horizon Islands" subtitle="Beyond the known map" size="sm">
        <p className="text-sm leading-relaxed text-slate-300">
          Nobody has charted these islands yet. They are where new lands will open as the world of Questly grows.
        </p>
      </Sheet>
    </div>
  )
}

/* --- the map itself ------------------------------------------------------------ */

const MAX_SCALE = 1.25
const REGION_RANK = new Map((Object.keys(REGION_META) as RegionId[]).map((id, i) => [id as string, i]))
const regionRank = (id: string) => REGION_RANK.get(id) ?? 99

/** Club halls stand in a row under their region's label: the middle first, then either side. */
const CLUB_SLOTS = [0, -1, 1]

/** How the painting is lit at each time of day. */
const LIGHTING: Record<TimeOfDay, { filter: string; wash: string | null; blend: 'soft-light' | 'multiply' }> = {
  morning: { filter: 'saturate(1.06) sepia(0.12) brightness(1.03)', wash: 'linear-gradient(160deg, rgba(255,196,130,0.34), transparent 60%)', blend: 'soft-light' },
  day: { filter: 'none', wash: null, blend: 'soft-light' },
  evening: { filter: 'saturate(1.12) sepia(0.26) brightness(0.84) hue-rotate(-6deg)', wash: 'linear-gradient(180deg, rgba(255,128,64,0.34), rgba(120,50,150,0.36))', blend: 'soft-light' },
  night: { filter: 'brightness(0.46) saturate(0.72) contrast(1.08) hue-rotate(8deg)', wash: 'radial-gradient(ellipse at 50% 45%, rgba(40,70,160,0.10), rgba(4,8,30,0.45))', blend: 'multiply' },
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function WorldCanvas({
  time,
  regions,
  events,
  clubs,
  onOpen,
}: {
  time: TimeOfDay
  regions: Map<RegionId, WorldRegion>
  events: WorldEvent[]
  clubs: Record<string, WorldClub[]>
  onOpen: (id: RegionId | 'guild' | 'horizon') => void
}) {
  const reduce = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [minScale, setMinScale] = useState(0.3)
  const [loaded, setLoaded] = useState(false)
  // The map point to keep at the centre of the view after the next zoom.
  const pendingCentre = useRef<{ x: number; y: number } | null>(GUILD_POINT)
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)

  // The smallest zoom still fills the frame; the first one shows a good piece of the world.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const min = Math.max(el.clientWidth / WORLD_W, el.clientHeight / WORLD_H)
      setMinScale(min)
      setScale((s) => (s === null ? clamp(el.clientWidth < 640 ? 0.62 : 0.8, min, MAX_SCALE) : clamp(s, min, MAX_SCALE)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const centre = pendingCentre.current
    if (!el || !centre || scale === null) return
    el.scrollLeft = centre.x * scale - el.clientWidth / 2
    el.scrollTop = centre.y * scale - el.clientHeight / 2
    pendingCentre.current = null
  }, [scale])

  function zoomBy(step: number) {
    const el = scrollRef.current
    if (!el || scale === null) return
    const next = clamp(Math.round((scale + step) * 100) / 100, minScale, MAX_SCALE)
    if (next === scale) return
    pendingCentre.current = { x: (el.scrollLeft + el.clientWidth / 2) / scale, y: (el.scrollTop + el.clientHeight / 2) / scale }
    setScale(next)
  }

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

  const s = scale ?? 0.62
  const eventRegions = new Set(events.filter((e) => e.state === 'active').map((e) => e.region))
  const lighting = LIGHTING[time]
  const px = (n: number) => n * s
  // Halls stay big enough to see when zoomed out, and do not balloon when zoomed in.
  const hall = Math.round(clamp(s * 72, 38, 64))

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="no-scrollbar relative isolate h-[62dvh] max-h-[680px] min-h-[340px] cursor-grab overflow-auto rounded-2xl border border-ink-700 bg-[#123a63] active:cursor-grabbing"
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
        {/* Clipped, so mist and glows at the edges never widen the scrollable area past the painting. */}
        <div className="relative overflow-hidden" style={{ width: px(WORLD_W), height: px(WORLD_H), visibility: scale === null ? 'hidden' : undefined }}>
          {/* A few hundred bytes of blur hold the place while the painting arrives. */}
          <div aria-hidden className="absolute inset-0 scale-105 bg-cover blur-md" style={{ backgroundImage: `url(${worldArtTiny})`, filter: lighting.filter === 'none' ? undefined : lighting.filter }} />
          <img
            src={worldArt}
            srcSet={`${worldArtSmall} 768w, ${worldArt} 1536w`}
            sizes={`${Math.round(px(WORLD_W))}px`}
            alt="The Questly world: forests, snowy peaks, a volcano, a desert of pyramids, farmland, a harbour city, old ruins and islands around a great central guild hall"
            draggable={false}
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full select-none transition-[opacity,filter] duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: lighting.filter }}
          />
          {lighting.wash && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: lighting.wash, mixBlendMode: lighting.blend }} />}

          {/* Cloud shadows by day; lanterns, lighthouses and forge fires by night. */}
          {!reduce && (time === 'day' || time === 'morning') && (
            <>
              <span className="pointer-events-none absolute left-[-20%] top-[28%] h-40 w-96 rounded-full bg-black/15 blur-3xl [animation:world-drift_90s_linear_infinite]" />
              <span className="pointer-events-none absolute left-[-35%] top-[64%] h-32 w-80 rounded-full bg-black/15 blur-3xl [animation:world-drift_120s_linear_infinite] [animation-delay:-50s]" />
            </>
          )}
          {(time === 'night' || time === 'evening') &&
            NIGHT_LIGHTS.map(([x, y, r, rgb], i) => (
              <span
                key={i}
                aria-hidden
                className={`pointer-events-none absolute rounded-full ${reduce ? '' : '[animation:world-flicker_5s_ease-in-out_infinite]'}`}
                style={{
                  left: px(x - r),
                  top: px(y - r),
                  width: px(r * 2),
                  height: px(r * 2),
                  background: `radial-gradient(circle, rgba(${rgb},${time === 'night' ? 0.9 : 0.45}) 0%, rgba(${rgb},0.25) 38%, transparent 70%)`,
                  mixBlendMode: 'screen',
                  animationDelay: `${(i % 7) * -0.7}s`,
                }}
              />
            ))}

          {/* Mist over lands that are still locked. */}
          {(Object.keys(REGION_META) as RegionId[]).map((id) => {
            const r = regions.get(id)
            if (!r || r.unlocked) return null
            const { cx, cy, rx, ry } = REGION_META[id].area
            const mask = 'radial-gradient(closest-side, #000 58%, transparent 100%)'
            return (
              <div key={`fog-${id}`} aria-hidden className="pointer-events-none absolute" style={{ left: px(cx - rx), top: px(cy - ry), width: px(rx * 2), height: px(ry * 2) }}>
                <div className="absolute inset-0" style={{ backdropFilter: 'grayscale(0.85) brightness(0.62) blur(2px)', WebkitBackdropFilter: 'grayscale(0.85) brightness(0.62) blur(2px)', maskImage: mask, WebkitMaskImage: mask }} />
                <div
                  className={`absolute inset-0 ${reduce ? '' : '[animation:world-mist_14s_ease-in-out_infinite]'}`}
                  style={{ background: 'radial-gradient(closest-side, rgba(214,222,255,0.30), rgba(214,222,255,0.12) 60%, transparent)', maskImage: mask, WebkitMaskImage: mask }}
                />
              </div>
            )
          })}

          {(Object.keys(REGION_META) as RegionId[]).flatMap((id) =>
            (clubs[id] ?? []).slice(0, CLUB_SLOTS.length).map((club, i) => {
              const { x, y } = REGION_META[id].point
              // Offsets in screen pixels, so the row clears the label (and a lock pill) at any zoom.
              const below = 24 + (regions.get(id)?.unlocked === false ? 20 : 0) + hall / 2
              const art = clubHall({ slug: club.slug, region: id, tier: club.tier })
              return (
                <Link
                  key={club.slug}
                  to={`/clubs/${club.slug}`}
                  aria-label={`${club.name}, a level ${club.level} club in its ${art.name}`}
                  title={`${club.name} · ${art.name} · Level ${club.level}`}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  style={{ left: px(x) + CLUB_SLOTS[i] * (hall + 10), top: px(y) + below }}
                >
                  <span
                    className="block overflow-hidden rounded-xl border-2 shadow-[0_6px_14px_rgba(0,0,0,0.55)] transition-transform duration-150 group-hover:scale-110"
                    style={{ width: hall, height: hall, borderColor: `${REGION_META[id].accent}cc` }}
                  >
                    <img src={art.thumb} alt="" draggable={false} className="h-full w-full select-none object-cover" />
                  </span>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#07101d]/90 px-1.5 text-[9px] font-bold leading-4 text-white ring-1 ring-white/20">
                    Lv {club.level}
                  </span>
                </Link>
              )
            }),
          )}

          <PlaceMarker
            x={px(GUILD_POINT.x)}
            y={px(GUILD_POINT.y)}
            name="The Grand Guild"
            icon={Castle}
            accent="#f1c75b"
            prominent
            ariaLabel="The Grand Guild: quest board, clubs and duels"
            onOpen={() => onOpen('guild')}
          />

          {(Object.keys(REGION_META) as RegionId[]).map((id) => {
            const r = regions.get(id)
            if (!r) return null
            const meta = REGION_META[id]
            const openQuests = r.quests.filter((q) => !q.quest).length
            const needLevel = r.requirements.find((q) => q.type === 'level' && !q.met)
            const event = eventRegions.has(id)
            return (
              <PlaceMarker
                key={id}
                x={px(meta.point.x)}
                y={px(meta.point.y)}
                name={meta.name}
                icon={meta.icon}
                accent={meta.accent}
                locked={!r.unlocked}
                lockLabel={!r.unlocked ? (needLevel ? `Level ${needLevel.target}` : 'Sealed') : undefined}
                quests={r.unlocked ? openQuests : 0}
                event={event}
                ariaLabel={`${meta.name}${r.unlocked ? '' : ', locked'}${openQuests && r.unlocked ? `, ${openQuests} quests to take` : ''}${event ? ', event running' : ''}`}
                onOpen={() => onOpen(id)}
              />
            )
          })}

          <PlaceMarker x={px(HORIZON_POINT.x)} y={px(HORIZON_POINT.y)} name="Horizon Islands" icon={Compass} accent="#9fb4cc" muted ariaLabel="Horizon Islands, not yet charted" onOpen={() => onOpen('horizon')} />
        </div>
      </div>

      {/* Above the map, so a place label scrolled underneath never takes the tap. */}
      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(0.15)} disabled={scale !== null && scale >= MAX_SCALE} aria-label="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-950/85 text-slate-200 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:text-slate-600">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => zoomBy(-0.15)} disabled={scale !== null && scale <= minScale + 0.001} aria-label="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-950/85 text-slate-200 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:text-slate-600">
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * A place on the map: a label pinned to its landmark. Its size does not follow
 * the zoom, so names stay readable however far out the map is.
 */
function PlaceMarker({
  x,
  y,
  name,
  icon: Icon,
  accent,
  locked = false,
  lockLabel,
  quests = 0,
  event = false,
  prominent = false,
  muted = false,
  ariaLabel,
  onOpen,
}: {
  x: number
  y: number
  name: string
  icon: LucideIcon
  accent: string
  locked?: boolean
  lockLabel?: string
  quests?: number
  event?: boolean
  prominent?: boolean
  muted?: boolean
  ariaLabel: string
  onOpen: () => void
}) {
  const border = locked ? 'rgba(148,163,184,0.5)' : muted ? 'rgba(159,180,204,0.45)' : `${accent}b3`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:outline-none"
      style={{ left: x, top: y }}
    >
      <span
        className={`relative flex items-center gap-1.5 rounded-full border bg-[#07101d]/80 py-1 pl-1 pr-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-[3px] transition-transform duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-gold-400 ${prominent ? 'border-2 py-1.5 pl-1.5 pr-3' : ''}`}
        style={{ borderColor: border }}
      >
        <span
          className={`flex items-center justify-center rounded-full ${prominent ? 'h-7 w-7' : 'h-6 w-6'}`}
          style={{ background: locked ? 'rgba(71,85,105,0.65)' : `${accent}2e`, color: locked ? '#cbd5e1' : accent }}
        >
          {locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Icon className={prominent ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />}
        </span>
        <span className={`whitespace-nowrap font-display font-bold tracking-wide ${prominent ? 'text-[13px] text-[#fbe3a1]' : 'text-[12px]'} ${locked || muted ? 'text-slate-300' : prominent ? '' : 'text-white'}`}>{name}</span>
        {quests > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-reward-400 px-1 text-[9px] font-bold tabular-nums text-[#281a04] ring-2 ring-[#07101d]">
            {quests}
          </span>
        )}
        {event && (
          <span className="absolute -left-1.5 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#7a2fd0] text-white ring-2 ring-[#07101d]">
            <Flag className="h-3 w-3" aria-hidden />
          </span>
        )}
      </span>
      {lockLabel && (
        <span className="mt-1 whitespace-nowrap rounded-full border border-[#9a6ae8]/40 bg-[#1e1336]/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#d8c2ff]">
          {lockLabel}
        </span>
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

function RegionDetail({ region, clubs, events, onTaken }: { region: WorldRegion; clubs: WorldClub[]; events: WorldEvent[]; onTaken: () => void }) {
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

      <section>
        <h3 className="eyebrow mb-2">Clubs standing here</h3>
        {clubs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-600 px-3 py-3 text-xs text-slate-500">No club has raised a hall here yet.</p>
        ) : (
          <ul className="space-y-2">
            {clubs.map((club) => (
              <li key={club.slug}>
                <Link to={`/clubs/${club.slug}`} className="panel flex items-center gap-3 px-3 py-2 hover:border-ink-500">
                  <img src={clubHall({ slug: club.slug, region: region.id, tier: club.tier }).thumb} alt="" width={48} height={48} className="h-12 w-12 rounded-lg border object-cover" style={{ borderColor: `${meta.accent}80` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">{club.name}</span>
                    <span className="block text-xs text-slate-500">
                      Level {club.level} · {club.members} member{club.members === 1 ? '' : 's'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/clubs/new" className="mt-2 inline-block text-xs font-semibold text-gold-400 hover:text-gold-300">
          Found a club
        </Link>
      </section>
    </div>
  )
}
