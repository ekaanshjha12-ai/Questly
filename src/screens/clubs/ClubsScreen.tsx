import { useCallback, useEffect, useMemo, useState } from 'react'
import { Castle, Lock, Plus, Search, Users } from 'lucide-react'
import { clubs as clubApi, type ClubInput, type ClubSummary } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { Link, useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { messageOf, useToast } from '../../components/ui/Toast'
import { clubBuilding } from '../../art/club'
import { CONSEQUENCE_LABEL, REGION_NAMES, regionAccent, regionName } from './clubFormat'
import type { RegionId } from '../../art/world'

/**
 * Clubs: the ones you belong to, and the rest of the world's to discover —
 * searchable by name and by the region they stand in. Founding one needs a
 * little standing (the server says how much).
 */

const MIN_LEVEL_TO_FOUND = 3

export default function ClubsScreen() {
  const { snapshot } = useGame()
  const { path, navigate } = useRouter()
  const [mine, setMine] = useState<ClubSummary[] | null>(null)
  const [found, setFound] = useState<ClubSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string>('')
  const creating = path === '/clubs/new'

  const load = useCallback(async () => {
    try {
      const [my, all] = await Promise.all([clubApi.list({ mine: true }), clubApi.list({ q: query.trim(), region: region || undefined })])
      setMine(my.clubs)
      setFound(all.clubs)
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Could not load clubs.'))
    }
  }, [query, region])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), query ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [load, query])

  const level = snapshot?.progress.level ?? 1
  const discover = useMemo(() => (found ?? []).filter((c) => !c.myStatus), [found])

  return (
    <div>
      <PageHeader title="Clubs" subtitle="Communities with a home in the world" />

      <div className="mb-4 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-400">Join one through its trials, or found your own.</p>
        <Button icon={Plus} onClick={() => navigate('/clubs/new')}>
          Found a club
        </Button>
      </div>

      {error && !found && <ErrorState message={error} onRetry={() => void load()} />}
      {!found && !error && <LoadingState lines={3} label="Finding clubs" />}

      {mine && mine.length > 0 && (
        <section className="mb-6" aria-label="Your clubs">
          <h2 className="eyebrow mb-2.5">Your clubs</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {mine.map((c) => (
              <li key={c.id}>
                <ClubCard club={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {found && (
        <section aria-label="Discover clubs">
          <h2 className="eyebrow mb-2.5">Discover</h2>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3">
            <Search className="h-4 w-4 text-slate-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clubs"
              aria-label="Search clubs"
              className="min-h-[44px] min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Region">
            {[['', 'Everywhere'], ...Object.entries(REGION_NAMES)].map(([id, name]) => (
              <button
                key={id || 'all'}
                type="button"
                role="radio"
                aria-checked={region === id}
                onClick={() => setRegion(id)}
                className={`min-h-[34px] shrink-0 rounded-full border px-3 text-xs font-semibold ${region === id ? 'border-gold-500/60 bg-gold-500/10 text-gold-300' : 'border-ink-700 text-slate-400 hover:text-slate-200'}`}
              >
                {name}
              </button>
            ))}
          </div>
          {discover.length === 0 ? (
            <EmptyState
              icon={Castle}
              title={query || region ? 'No clubs match' : 'No clubs yet'}
              body={query || region ? 'Try another name or region.' : 'Found the first one and give everyone somewhere to belong.'}
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {discover.map((c) => (
                <li key={c.id}>
                  <ClubCard club={c} playerLevel={level} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={creating} onClose={() => navigate('/clubs', { replace: true })} title="Found a club" subtitle="It stands in the world from the moment it exists">
        <ClubComposer level={level} onCreated={(slug) => navigate(`/clubs/${slug}`, { replace: true })} />
      </Sheet>
    </div>
  )
}

function ClubCard({ club, playerLevel }: { club: ClubSummary; playerLevel?: number }) {
  const accent = regionAccent(club.region)
  const locked = playerLevel !== undefined && playerLevel < club.minLevel
  return (
    <Link to={`/clubs/${club.slug}`} className="panel flex items-center gap-3 px-3 py-3 hover:border-ink-500">
      <img src={clubBuilding(club.tier.id, accent)} alt="" className="pixelated h-14 w-14 shrink-0 object-contain" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-bold text-slate-50">{club.name}</span>
        <span className="block truncate text-xs text-slate-400">
          {regionName(club.region)} · Level {club.level} {club.tier.name}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden /> {club.members}
          </span>
          <span>{club.xp.toLocaleString()} Club XP</span>
          {club.myStatus === 'trial' && <span className="tag border-reward-500/40 text-reward-300">On trial</span>}
          {club.myStatus === 'active' && <span className="tag border-gold-500/40 text-gold-300">Member</span>}
          {locked && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Lock className="h-3 w-3" aria-hidden /> LV {club.minLevel}
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}

function ClubComposer({ level, onCreated }: { level: number; onCreated: (slug: string) => void }) {
  const toast = useToast()
  const [form, setForm] = useState<ClubInput>({ name: '', description: '', rules: '', region: 'focus_sanctum', minLevel: 1, consequence: 'warning' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const set = <K extends keyof ClubInput>(key: K, value: ClubInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  if (level < MIN_LEVEL_TO_FOUND) {
    return (
      <EmptyState
        icon={Lock}
        title={`Reach level ${MIN_LEVEL_TO_FOUND} to found a club`}
        body={`You are level ${level}. A few quests and focus sessions get you there — a club needs a leader who shows up.`}
      />
    )
  }

  async function submit() {
    setBusy(true)
    setProblem(null)
    try {
      const { club } = await clubApi.create(form)
      toast.success(`${club.name} is founded`, `It now stands in ${regionName(club.region)}.`)
      onCreated(club.slug)
    } catch (err) {
      setProblem(messageOf(err, 'Could not found the club.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="block">
        <span className="eyebrow">Name</span>
        <input className="field mt-1.5" value={form.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder="Startup Builders" required />
      </label>
      <label className="block">
        <span className="eyebrow">What it is about</span>
        <textarea className="field mt-1.5 min-h-[80px]" value={form.description} maxLength={400} onChange={(e) => set('description', e.target.value)} placeholder="Founders shipping something real every week." required />
      </label>
      <label className="block">
        <span className="eyebrow">Rules</span>
        <textarea className="field mt-1.5 min-h-[80px]" value={form.rules} maxLength={1000} onChange={(e) => set('rules', e.target.value)} placeholder={'Be kind.\nShare progress every week.\nNo spam or selling.'} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Where it stands</span>
          <select className="field mt-1.5" value={form.region} onChange={(e) => set('region', e.target.value)}>
            {(Object.keys(REGION_NAMES) as RegionId[]).map((id) => (
              <option key={id} value={id}>
                {REGION_NAMES[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Level to join</span>
          <input className="field mt-1.5" type="number" min={1} max={50} value={form.minLevel} onChange={(e) => set('minLevel', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <fieldset>
        <legend className="eyebrow">If a member misses a mandatory challenge</legend>
        <div className="mt-1.5 space-y-1.5">
          {(Object.keys(CONSEQUENCE_LABEL) as ClubInput['consequence'][]).map((c) => (
            <label key={c} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${form.consequence === c ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-700'}`}>
              <input type="radio" name="consequence" className="mt-1 accent-[rgb(var(--gold-500))]" checked={form.consequence === c} onChange={() => set('consequence', c)} />
              <span>
                <span className="block text-sm font-semibold text-slate-100">{CONSEQUENCE_LABEL[c].label}</span>
                <span className="block text-xs text-slate-400">{CONSEQUENCE_LABEL[c].detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Clubs can never charge, fine or wager anything. Entry trials are set after founding.</p>
      </fieldset>
      {problem && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{problem}</p>}
      <Button type="submit" block loading={busy} disabled={!form.name.trim() || form.description.trim().length < 10 || form.rules.trim().length < 10}>
        Found the club
      </Button>
    </form>
  )
}
