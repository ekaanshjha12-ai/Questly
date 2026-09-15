import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crown, Flag, Loader2, Lock, LogOut, Play, Plus, Send, Settings2, Shield, Trash2, UserPlus, Users } from 'lucide-react'
import type { AppState } from '../../types'
import {
  clubs as clubApi,
  type AuthUser,
  type ClubChallenge,
  type ClubDetail,
  type ClubLeaderboardRow,
  type ClubMessage,
  type TrialKind,
} from '../../lib/api'
import { Link, match, useRouter } from '../../app/router'
import { PageHeader, BackLink } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/Bars'
import { ConfirmDialog, Sheet } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import Tabs from '../../components/ui/Tabs'
import { messageOf, useToast } from '../../components/ui/Toast'
import HeroSprite from '../../components/art/HeroSprite'
import FeedScreen from '../../components/social/FeedScreen'
import { clubBuilding } from '../../art/club'
import { ApiError } from '../../lib/api'
import {
  CONSEQUENCE_LABEL,
  REGION_NAMES,
  ROLE_LABEL,
  TRIAL_KIND_LABEL,
  VISIBILITY_LABEL,
  challengeGoal,
  regionAccent,
  regionName,
  timeLeft,
} from './clubFormat'
import type { RegionId } from '../../data/world'

/**
 * One club: its hall, its standing, the way in, and — for members — its feed,
 * challenges, members, leaderboard and chat. Leaders get the controls their
 * role allows; the server checks every one of them again.
 */

type Tab = 'home' | 'feed' | 'challenges' | 'members' | 'leaderboard' | 'chat' | 'about'
const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'feed', label: 'Feed' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'members', label: 'Members' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'chat', label: 'Chat' },
  { id: 'about', label: 'About' },
]

export default function ClubScreen({ state, user }: { state: AppState; user: AuthUser }) {
  const { path, navigate } = useRouter()
  const params = match('/clubs/:slug/:tab', path) ?? match('/clubs/:slug', path)
  const slug = params?.slug ?? ''
  const tab = (TABS.some((t) => t.id === params?.tab) ? params?.tab : 'home') as Tab
  const [club, setClub] = useState<ClubDetail | null>(null)
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null)
  const [managing, setManaging] = useState(false)

  const load = useCallback(async () => {
    try {
      setClub((await clubApi.get(slug)).club)
      setError(null)
    } catch (err) {
      setError({ message: messageOf(err, 'Could not load this club.'), missing: err instanceof ApiError && err.status === 404 })
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const back = <BackLink to="/clubs" label="Clubs" />
  if (!club) {
    return (
      <div>
        <PageHeader title="Club" back={back} />
        {error ? (
          error.missing ? (
            <EmptyState icon={Shield} title="This club is not available" body="It may have closed, or the link is wrong." action={<Button onClick={() => navigate('/clubs')}>Browse clubs</Button>} />
          ) : (
            <ErrorState message={error.message} onRetry={() => void load()} />
          )
        ) : (
          <LoadingState lines={4} label="Opening the club" />
        )}
      </div>
    )
  }

  const member = club.me?.status === 'active'

  return (
    <div>
      <PageHeader title={club.name} subtitle={`${regionName(club.region)} · ${club.tier.name}`} back={back} />

      <ClubBanner club={club} onManage={club.permissions.edit ? () => setManaging(true) : undefined} />

      {!member && <WayIn club={club} onChanged={setClub} />}

      <Tabs
        label="Club sections"
        className="mb-4 mt-4"
        tabs={TABS.filter((t) => member || !['chat'].includes(t.id))}
        value={tab}
        onChange={(id) => navigate(id === 'home' ? `/clubs/${club.slug}` : `/clubs/${club.slug}/${id}`, { keepScroll: true, replace: true })}
      />

      {tab === 'home' && <ClubHome club={club} onGo={(t) => navigate(`/clubs/${club.slug}/${t}`, { keepScroll: true, replace: true })} />}
      {tab === 'feed' && (
        <FeedScreen
          state={state}
          myName={user.displayName ?? state.player.name}
          club={{ slug: club.slug, canPost: club.permissions.post, canAnnounce: club.permissions.announce, canModerate: club.permissions.manage }}
        />
      )}
      {tab === 'challenges' && <ClubChallenges club={club} />}
      {tab === 'members' && <ClubMembers club={club} />}
      {tab === 'leaderboard' && <ClubLeaderboard club={club} />}
      {tab === 'chat' && member && <ClubChat club={club} />}
      {tab === 'about' && <ClubAbout club={club} onChanged={setClub} />}

      {club.permissions.edit && (
        <ManageSheet
          open={managing}
          club={club}
          onClose={() => setManaging(false)}
          onSaved={(next) => setClub(next)}
          onClosed={() => navigate('/clubs', { replace: true })}
        />
      )}
    </div>
  )
}

/* --- the hall ------------------------------------------------------------------------ */

function ClubBanner({ club, onManage }: { club: ClubDetail; onManage?: () => void }) {
  const accent = regionAccent(club.region)
  const span = Math.max(1, club.nextLevelXp - club.levelXp)
  const pct = ((club.xp - club.levelXp) / span) * 100
  return (
    <section className="panel-raised overflow-hidden" aria-label="Club standing">
      <div className="relative flex items-end gap-4 px-4 pt-4" style={{ background: `radial-gradient(ellipse at 20% 100%, ${accent}33, transparent 65%)` }}>
        <img src={clubBuilding(club.tier.id, accent)} alt={`${club.name}'s ${club.tier.name}`} className="pixelated -mb-1 h-28 w-28 shrink-0 object-contain" />
        <div className="min-w-0 flex-1 pb-3">
          <p className="font-pixel text-[10px] uppercase tracking-[0.14em]" style={{ color: accent }}>
            Level {club.level} · {club.tier.name}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {club.xp.toLocaleString()} Club XP · {Math.max(0, club.nextLevelXp - club.xp).toLocaleString()} to level {club.level + 1}
          </p>
          <ProgressBar percent={pct} tone="gold" className="mt-1.5" />
        </div>
        {onManage && (
          <button type="button" onClick={onManage} aria-label="Manage club" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-950/80 text-slate-300 hover:text-white">
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <dl className="grid grid-cols-3 divide-x divide-ink-700/70 border-t border-ink-700/70 text-center">
        <Stat label="Members" value={club.members} />
        <Stat label="Reputation" value={club.reputation} />
        <Stat label="This week" value={`+${club.activity.weeklyClubXp}`} />
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-2 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-bold tabular-nums text-slate-50">{typeof value === 'number' ? value.toLocaleString() : value}</dd>
    </div>
  )
}

/* --- the way in ------------------------------------------------------------------------- */

function WayIn({ club, onChanged }: { club: ClubDetail; onChanged: (club: ClubDetail) => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const status = club.me?.status ?? null
  const tooLow = club.playerLevel < club.minLevel
  const allMet = club.trialsList.length > 0 && club.trialsList.every((t) => t.met)

  async function run(work: () => Promise<{ club: ClubDetail }>, success: string) {
    setBusy(true)
    try {
      const { club: next } = await work()
      onChanged(next)
      toast.success(success)
    } catch (err) {
      toast.error('Not yet', messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-gold-500/30 bg-gold-500/5 p-4" aria-label="Joining">
      {status === 'removed' && (
        <p className="mb-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
          You were removed: {club.me?.removedReason ?? 'by the club leaders'}. You can rejoin by passing the trials again.
        </p>
      )}
      <p className="eyebrow">{status === 'trial' ? 'Your entry trials' : 'Entry requirements'}</p>
      <ul className="mt-2 space-y-2">
        <li className="flex items-center justify-between text-sm">
          <span className={`flex items-center gap-2 ${tooLow ? 'text-slate-300' : 'text-gold-300'}`}>
            {tooLow ? <Lock className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Level {club.minLevel}
          </span>
          <span className="text-xs tabular-nums text-slate-400">You are level {club.playerLevel}</span>
        </li>
        {club.trialsList.map((t) => (
          <li key={t.id}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className={`flex items-center gap-2 ${t.met ? 'text-gold-300' : 'text-slate-200'}`}>
                {t.met ? <Check className="h-4 w-4" aria-hidden /> : <span className="h-4 w-4" />} {t.title}
              </span>
              {status === 'trial' && (
                <span className="text-xs tabular-nums text-slate-400">
                  {t.current}/{t.target}
                </span>
              )}
            </div>
            {status === 'trial' && <ProgressBar percent={(t.current / Math.max(1, t.target)) * 100} className="mt-1" />}
          </li>
        ))}
      </ul>
      {status === 'trial' ? (
        <>
          <p className="mt-3 text-[11px] text-slate-500">Only what you do after starting counts. Focus in Focus Mode, finish quests — progress updates here.</p>
          <div className="mt-3 flex gap-2">
            <Button block loading={busy} disabled={!allMet || tooLow} onClick={() => void run(() => clubApi.completeTrials(club.slug), `Welcome to ${club.name}`)}>
              {allMet ? 'Complete trials and join' : 'Trials in progress'}
            </Button>
          </div>
        </>
      ) : (
        <Button
          block
          className="mt-3"
          loading={busy}
          disabled={tooLow}
          icon={Play}
          onClick={() => void run(() => clubApi.beginTrials(club.slug), club.trialsList.length ? 'Trials begun' : `Welcome to ${club.name}`)}
        >
          {tooLow ? `Reach level ${club.minLevel} first` : club.trialsList.length ? 'Begin entry trials' : 'Join the club'}
        </Button>
      )}
    </section>
  )
}

/* --- home ----------------------------------------------------------------------------------- */

function ClubHome({ club, onGo }: { club: ClubDetail; onGo: (tab: Tab) => void }) {
  const [challenges, setChallenges] = useState<ClubChallenge[] | null>(null)
  useEffect(() => {
    clubApi.challenges(club.slug).then((r) => setChallenges(r.challenges)).catch(() => setChallenges([]))
  }, [club.slug])
  const active = (challenges ?? []).filter((c) => c.state === 'active').slice(0, 3)

  return (
    <div className="space-y-4">
      {club.me?.status === 'active' && (
        <section className="panel flex items-center gap-3 px-4 py-3" aria-label="Your standing">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-reward-500/40 bg-reward-500/10 text-reward-400">
            <Crown className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-100">
              {club.me.rank} · {ROLE_LABEL[club.me.role]}
            </span>
            <span className="block text-xs text-slate-400">
              {club.me.clubXp.toLocaleString()} Club XP contributed{club.me.warnings ? ` · ${club.me.warnings} warning${club.me.warnings === 1 ? '' : 's'}` : ''}
            </span>
          </span>
        </section>
      )}

      <section aria-label="Current challenges">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="eyebrow">Current challenges</h2>
          <button type="button" onClick={() => onGo('challenges')} className="text-xs font-semibold text-gold-400 hover:text-gold-300">
            See all
          </button>
        </div>
        {!challenges ? (
          <LoadingState lines={1} label="Loading challenges" />
        ) : active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-600 px-3 py-4 text-center text-xs text-slate-500">No challenge is running right now.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((c) => (
              <li key={c.id} className="panel px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  {c.title} <VisibilityTag visibility={c.visibility} />
                </p>
                <p className="text-xs text-slate-400">
                  {challengeGoal(c)} · {timeLeft(c.endsAt)} · +{c.clubXp} Club XP
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel px-4 py-3" aria-label="About">
        <p className="eyebrow">About</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{club.description}</p>
        <Link to={`/clubs/${club.slug}/about`} className="mt-2 inline-block text-xs font-semibold text-gold-400 hover:text-gold-300">
          Rules and details
        </Link>
      </section>
    </div>
  )
}

function VisibilityTag({ visibility }: { visibility: ClubChallenge['visibility'] }) {
  const tone = visibility === 'mandatory' ? 'border-danger-500/40 text-danger-400' : visibility === 'public' ? 'border-info-500/40 text-info-400' : 'border-ink-500 text-slate-300'
  return <span className={`tag ${tone}`}>{VISIBILITY_LABEL[visibility].label}</span>
}

/* --- challenges --------------------------------------------------------------------------------- */

function ClubChallenges({ club }: { club: ClubDetail }) {
  const toast = useToast()
  const { navigate } = useRouter()
  const [list, setList] = useState<ClubChallenge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setList((await clubApi.challenges(club.slug)).challenges)
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Could not load challenges.'))
    }
  }, [club.slug])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, work: () => Promise<unknown>, done: string) {
    setBusy(id)
    try {
      await work()
      toast.success(done)
      await load()
    } catch (err) {
      toast.error('That did not work', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {club.permissions.manage && (
        <Button icon={Plus} variant="secondary" onClick={() => setComposing(true)}>
          New club challenge
        </Button>
      )}
      {error && !list && <ErrorState message={error} onRetry={() => void load()} />}
      {!list && !error && <LoadingState lines={2} label="Loading challenges" />}
      {list && list.length === 0 && <EmptyState icon={Flag} title="No challenges yet" body={club.permissions.manage ? 'Set the first one for your members.' : 'The club leaders set challenges here.'} />}
      <ul className="space-y-2">
        {list?.map((c) => {
          const pct = c.mine ? (c.mine.progress / Math.max(1, c.target)) * 100 : 0
          return (
            <li key={c.id} className="panel px-3 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                    {c.title} <VisibilityTag visibility={c.visibility} />
                    {c.state === 'ended' && <span className="tag border-ink-600 text-slate-500">Ended</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{c.description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {challengeGoal(c)} · {c.state === 'active' ? timeLeft(c.endsAt) : 'finished'} · <span className="text-reward-300">+{c.clubXp} Club XP</span> · {c.completed}/{c.participants} done
                  </p>
                </div>
              </div>
              {c.mine && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {c.mine.status === 'completed' ? 'Completed' : c.mine.status === 'failed' ? 'Missed' : 'Your progress'}
                    </span>
                    <span className="tabular-nums">
                      {c.mine.progress}/{c.target} {c.kind === 'focus_minutes' ? 'min' : 'days'}
                    </span>
                  </div>
                  <ProgressBar percent={pct} className="mt-1" />
                </div>
              )}
              {c.state === 'active' && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {!c.mine && (club.me?.status === 'active' || c.visibility === 'public') && (
                    <Button size="sm" loading={busy === c.id} onClick={() => void act(c.id, () => clubApi.joinChallenge(club.slug, c.id), 'You are in')}>
                      Join
                    </Button>
                  )}
                  {c.mine?.status === 'joined' && c.kind === 'checkin' && (
                    <Button size="sm" icon={Check} disabled={c.mine.checkedInToday} loading={busy === c.id} onClick={() => void act(c.id, () => clubApi.checkIn(club.slug, c.id), 'Checked in for today')}>
                      {c.mine.checkedInToday ? 'Checked in today' : 'Check in'}
                    </Button>
                  )}
                  {c.mine?.status === 'joined' && c.kind === 'focus_minutes' && (
                    <Button size="sm" icon={Play} variant="secondary" onClick={() => navigate('/focus')}>
                      Focus now
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Sheet open={composing} onClose={() => setComposing(false)} title="New club challenge" subtitle={club.name}>
        <ChallengeComposer
          club={club}
          onCreated={() => {
            setComposing(false)
            void load()
          }}
        />
      </Sheet>
    </div>
  )
}

function ChallengeComposer({ club, onCreated }: { club: ClubDetail; onCreated: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ClubChallenge['visibility']>('optional')
  const [kind, setKind] = useState<ClubChallenge['kind']>('focus_minutes')
  const [days, setDays] = useState(7)
  const [target, setTarget] = useState(300)
  const [busy, setBusy] = useState(false)
  const reward = kind === 'focus_minutes' ? Math.min(300, Math.max(10, Math.round(target / 10))) : Math.min(300, Math.max(10, target * 10))

  async function submit() {
    setBusy(true)
    try {
      await clubApi.createChallenge(club.slug, { title, description, visibility, kind, target, durationDays: days })
      toast.success('Challenge set', visibility === 'mandatory' ? 'Every member is in it and has been told.' : 'Members have been told.')
      onCreated()
    } catch (err) {
      toast.error('Could not set the challenge', messageOf(err))
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
        <span className="eyebrow">Title</span>
        <input className="field mt-1.5" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Deep Work Week" required />
      </label>
      <label className="block">
        <span className="eyebrow">What it is for</span>
        <textarea className="field mt-1.5 min-h-[64px]" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Five hours of focus on your main project." required />
      </label>
      <fieldset>
        <legend className="eyebrow">Who is in it</legend>
        <div className="mt-1.5 space-y-1.5">
          {(Object.keys(VISIBILITY_LABEL) as ClubChallenge['visibility'][]).map((v) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 ${visibility === v ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-700'}`}>
              <input type="radio" name="visibility" className="mt-1 accent-[rgb(var(--gold-500))]" checked={visibility === v} onChange={() => setVisibility(v)} />
              <span>
                <span className="block text-sm font-semibold text-slate-100">{VISIBILITY_LABEL[v].label}</span>
                <span className="block text-xs text-slate-400">{VISIBILITY_LABEL[v].detail}</span>
              </span>
            </label>
          ))}
        </div>
        {visibility === 'mandatory' && <p className="mt-2 text-[11px] text-slate-500">Missing it brings this club’s consequence: {CONSEQUENCE_LABEL[club.consequence].label.toLowerCase()}.</p>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Measured by</span>
          <select
            className="field mt-1.5"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as ClubChallenge['kind']
              setKind(next)
              setTarget(next === 'focus_minutes' ? 300 : Math.min(days, 5))
            }}
          >
            <option value="focus_minutes">Timed focus</option>
            <option value="checkin">Daily check-ins</option>
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Days</span>
          <select className="field mt-1.5" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[3, 5, 7, 14, 21, 30].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow">{kind === 'focus_minutes' ? 'Minutes of focus in total' : 'Days to check in'}</span>
        <input
          className="field mt-1.5"
          type="number"
          min={kind === 'focus_minutes' ? 30 : 1}
          max={kind === 'focus_minutes' ? days * 240 : days}
          value={target}
          onChange={(e) => setTarget(Math.round(Number(e.target.value) || 0))}
        />
      </label>
      <p className="text-xs text-slate-400">
        Pays <span className="font-semibold text-reward-300">+{reward} Club XP</span> to each member who completes it. The server sets the reward from what the challenge asks.
      </p>
      <Button type="submit" block loading={busy} disabled={title.trim().length < 3 || description.trim().length < 3}>
        Set the challenge
      </Button>
    </form>
  )
}

/* --- members and leaderboard ------------------------------------------------------------------------ */

function useLeaderboard(slug: string) {
  const [rows, setRows] = useState<ClubLeaderboardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setRows((await clubApi.leaderboard(slug)).leaderboard)
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Could not load the members.'))
    }
  }, [slug])
  useEffect(() => {
    void load()
  }, [load])
  return { rows, setRows, error, load }
}

function ClubMembers({ club }: { club: ClubDetail }) {
  const toast = useToast()
  const { rows, setRows, error, load } = useLeaderboard(club.slug)
  const [invite, setInvite] = useState('')
  const [removing, setRemoving] = useState<ClubLeaderboardRow | null>(null)
  const isOwner = club.me?.role === 'owner' && club.me.status === 'active'

  async function sendInvite() {
    try {
      await clubApi.invite(club.slug, invite.trim())
      toast.success('Invitation sent', `@${invite.trim().replace(/^@/, '')} can find ${club.name} in their Chronicle Log.`)
      setInvite('')
    } catch (err) {
      toast.error('Could not invite them', messageOf(err))
    }
  }

  const byRole = useMemo(() => {
    const order = { owner: 0, officer: 1, member: 2 }
    return [...(rows ?? [])].sort((a, b) => order[a.role] - order[b.role] || b.clubXp - a.clubXp)
  }, [rows])

  return (
    <div className="space-y-3">
      {club.permissions.manage && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (invite.trim()) void sendInvite()
          }}
        >
          <input className="field" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Invite by @username" aria-label="Invite by username" />
          <Button type="submit" icon={UserPlus} variant="secondary" disabled={!invite.trim()}>
            Invite
          </Button>
        </form>
      )}
      {error && !rows && <ErrorState message={error} onRetry={() => void load()} />}
      {!rows && !error && <LoadingState lines={3} label="Loading members" />}
      <ul className="space-y-2">
        {byRole.map((r) => (
          <li key={r.player.username} className="panel flex items-center gap-3 px-3 py-2">
            <HeroSprite look={r.player.look} height={44} still label={`${r.player.name}'s character`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                <span className="truncate">{r.player.name}</span>
                {r.role !== 'member' && <span className="tag border-reward-500/40 text-reward-300">{ROLE_LABEL[r.role]}</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">
                @{r.player.username} · {r.rank} · {r.clubXp.toLocaleString()} Club XP{r.warnings ? ` · ${r.warnings} warning${r.warnings === 1 ? '' : 's'}` : ''}
              </span>
            </span>
            {!r.you && r.role !== 'owner' && club.permissions.manage && (
              <div className="flex shrink-0 gap-1">
                {isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void clubApi
                        .setRole(club.slug, r.player.username, r.role === 'officer' ? 'member' : 'officer')
                        .then((res) => setRows(res.leaderboard))
                        .catch((err) => toast.error('Could not change their role', messageOf(err)))
                    }
                  >
                    {r.role === 'officer' ? 'Make member' : 'Make officer'}
                  </Button>
                )}
                {(isOwner || r.role === 'member') && (
                  <Button size="sm" variant="ghost" aria-label={`Remove ${r.player.name}`} onClick={() => setRemoving(r)}>
                    <Trash2 className="h-4 w-4 text-danger-400" />
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.player.name ?? 'this member'}?`}
        body="They leave the club and keep their Questly progress. They can rejoin by passing the entry trials again."
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const who = removing
          setRemoving(null)
          if (!who) return
          void clubApi
            .removeMember(club.slug, who.player.username)
            .then((res) => {
              setRows(res.leaderboard)
              toast.success(`${who.player.name} was removed`)
            })
            .catch((err) => toast.error('Could not remove them', messageOf(err)))
        }}
      />
    </div>
  )
}

function ClubLeaderboard({ club }: { club: ClubDetail }) {
  const { rows, error, load } = useLeaderboard(club.slug)
  return (
    <div>
      {error && !rows && <ErrorState message={error} onRetry={() => void load()} />}
      {!rows && !error && <LoadingState lines={3} label="Loading the leaderboard" />}
      {rows && rows.length === 0 && <EmptyState icon={Users} title="No members yet" />}
      <ol className="space-y-2">
        {rows?.map((r) => (
          <li key={r.player.username} className={`panel flex items-center gap-3 px-3 py-2 ${r.you ? 'border-gold-500/50' : ''}`}>
            <span className={`w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums ${r.position <= 3 ? 'text-reward-300' : 'text-slate-400'}`}>{r.position}</span>
            <HeroSprite look={r.player.look} height={44} still label={`${r.player.name}'s character`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-100">
                {r.player.name}
                {r.you ? ' (you)' : ''}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {r.rank} · {ROLE_LABEL[r.role]} · Level {r.player.level}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-display text-base font-bold tabular-nums text-slate-50">{r.clubXp.toLocaleString()}</span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">Club XP</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-slate-500">Club XP comes from focus members put in and club challenges they complete. Nobody can set it by hand.</p>
    </div>
  )
}

/* --- chat ---------------------------------------------------------------------------------------- */

function ClubChat({ club }: { club: ClubDetail }) {
  const toast = useToast()
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const lastId = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    try {
      const { messages: next } = await clubApi.messages(club.slug, lastId.current)
      if (next.length) {
        lastId.current = next[next.length - 1].id
        setMessages((m) => [...m, ...next])
      }
    } catch {
      // The next poll tries again.
    }
  }, [club.slug])

  useEffect(() => {
    void poll()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void poll(), 4000)
    return () => window.clearInterval(t)
  }, [poll])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const { message } = await clubApi.sendMessage(club.slug, body)
      lastId.current = Math.max(lastId.current, message.id)
      setMessages((m) => [...m, message])
      setDraft('')
    } catch (err) {
      toast.error('Not sent', messageOf(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="panel flex h-[60dvh] min-h-[320px] flex-col overflow-hidden">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && <p className="py-10 text-center text-xs text-slate-500">Say hello to {club.name}. Keep it kind — messages are checked.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`group flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'rounded-br-md bg-gold-500/20 text-slate-50' : 'rounded-bl-md border border-ink-600 bg-ink-850 text-slate-100'}`}>
              {!m.mine && <p className="mb-0.5 text-[11px] font-semibold text-gold-300">{m.author.name}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                {new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                {(m.mine || club.permissions.manage) && (
                  <button
                    type="button"
                    onClick={() =>
                      void clubApi
                        .deleteMessage(club.slug, m.id)
                        .then(() => setMessages((list) => list.filter((x) => x.id !== m.id)))
                        .catch((err) => toast.error('Could not remove it', messageOf(err)))
                    }
                    className="text-slate-500 opacity-0 hover:text-danger-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    Remove
                  </button>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-ink-700 p-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input className="field" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${club.name}`} aria-label="Message the club" />
        <Button type="submit" aria-label="Send" disabled={!draft.trim()} loading={sending}>
          {!sending && <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}

/* --- about ------------------------------------------------------------------------------------------ */

function ClubAbout({ club, onChanged }: { club: ClubDetail; onChanged: (club: ClubDetail) => void }) {
  const toast = useToast()
  const [leaving, setLeaving] = useState(false)
  const [reported, setReported] = useState(false)

  return (
    <div className="space-y-4">
      <section className="panel px-4 py-3">
        <p className="eyebrow">About</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{club.description}</p>
      </section>
      <section className="panel px-4 py-3">
        <p className="eyebrow">Rules</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{club.rules}</p>
      </section>
      <dl className="panel divide-y divide-ink-700/70 text-sm">
        <Row label="Stands in">
          <Link to="/world" className="text-gold-400 hover:text-gold-300">
            {REGION_NAMES[club.region as RegionId] ?? club.region}
          </Link>
        </Row>
        <Row label="Level to join">{club.minLevel}</Row>
        <Row label="Entry trials">{club.trialsList.length ? club.trialsList.map((t) => t.title).join(' · ') : 'None'}</Row>
        <Row label="Missed mandatory challenge">{CONSEQUENCE_LABEL[club.consequence].label}</Row>
        <Row label="Leader">{club.owner ? `${club.owner.name} (@${club.owner.username})` : '—'}</Row>
        <Row label="Founded">{new Date(club.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Row>
      </dl>
      <p className="text-[11px] text-slate-500">Clubs on Questly cannot charge members, fine them or put anything of value at stake.</p>

      <div className="flex flex-wrap gap-2">
        {club.me && ['active', 'trial'].includes(club.me.status) && club.me.role !== 'owner' && (
          <Button variant="secondary" icon={LogOut} onClick={() => setLeaving(true)}>
            {club.me.status === 'trial' ? 'Stop the trials' : 'Leave the club'}
          </Button>
        )}
        {club.me?.role !== 'owner' && (
          <Button
            variant="ghost"
            icon={Flag}
            disabled={reported}
            onClick={() =>
              void clubApi
                .report(club.slug, 'Reported from the club page')
                .then(() => {
                  setReported(true)
                  toast.success('Reported', 'A moderator will look at this club.')
                })
                .catch((err) => toast.error('Could not report', messageOf(err)))
            }
          >
            {reported ? 'Reported' : 'Report club'}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={leaving}
        title={`Leave ${club.name}?`}
        body="You keep your Questly progress. To come back you will pass the entry trials again."
        confirmLabel="Leave"
        tone="danger"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false)
          void clubApi
            .leave(club.slug)
            .then(({ club: next }) => onChanged(next))
            .catch((err) => toast.error('Could not leave', messageOf(err)))
        }}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-slate-200">{children}</dd>
    </div>
  )
}

/* --- managing ------------------------------------------------------------------------------------------ */

function ManageSheet({
  open,
  club,
  onClose,
  onSaved,
  onClosed,
}: {
  open: boolean
  club: ClubDetail
  onClose: () => void
  onSaved: (club: ClubDetail) => void
  onClosed: () => void
}) {
  const toast = useToast()
  const [description, setDescription] = useState(club.description)
  const [rules, setRules] = useState(club.rules)
  const [minLevel, setMinLevel] = useState(club.minLevel)
  const [consequence, setConsequence] = useState(club.consequence)
  const [trials, setTrials] = useState<{ kind: TrialKind; target: number }[]>(club.trialsList.map((t) => ({ kind: t.kind, target: t.target })))
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!open) return
    setDescription(club.description)
    setRules(club.rules)
    setMinLevel(club.minLevel)
    setConsequence(club.consequence)
    setTrials(club.trialsList.map((t) => ({ kind: t.kind, target: t.target })))
  }, [open, club])

  async function save() {
    setBusy(true)
    try {
      await clubApi.update(club.slug, { description, rules, minLevel, consequence })
      const { club: next } = await clubApi.setTrials(club.slug, trials)
      onSaved(next)
      toast.success('Club updated')
      onClose()
    } catch (err) {
      toast.error('Could not save', messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Manage club"
      subtitle={club.name}
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="danger" size="sm" onClick={() => setClosing(true)}>
            Close club
          </Button>
          <Button size="sm" loading={busy} onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="eyebrow">What it is about</span>
          <textarea className="field mt-1.5 min-h-[72px]" value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block">
          <span className="eyebrow">Rules</span>
          <textarea className="field mt-1.5 min-h-[72px]" value={rules} maxLength={1000} onChange={(e) => setRules(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow">Level to join</span>
            <input className="field mt-1.5" type="number" min={1} max={50} value={minLevel} onChange={(e) => setMinLevel(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </label>
          <label className="block">
            <span className="eyebrow">Missed mandatory challenge</span>
            <select className="field mt-1.5" value={consequence} onChange={(e) => setConsequence(e.target.value as ClubDetail['consequence'])}>
              {(Object.keys(CONSEQUENCE_LABEL) as ClubDetail['consequence'][]).map((c) => (
                <option key={c} value={c}>
                  {CONSEQUENCE_LABEL[c].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="eyebrow">Entry trials (up to 3)</legend>
          <p className="mt-1 text-xs text-slate-400">Each is judged from what a candidate does after they begin. Changes apply to new candidates.</p>
          <ul className="mt-2 space-y-2">
            {trials.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <select
                  className="field"
                  aria-label={`Trial ${i + 1} kind`}
                  value={t.kind}
                  onChange={(e) => {
                    const kind = e.target.value as TrialKind
                    setTrials((list) => list.map((x, j) => (j === i ? { kind, target: TRIAL_KIND_LABEL[kind].min } : x)))
                  }}
                >
                  {(Object.keys(TRIAL_KIND_LABEL) as TrialKind[]).map((k) => (
                    <option key={k} value={k}>
                      {TRIAL_KIND_LABEL[k].label}
                    </option>
                  ))}
                </select>
                <input
                  className="field w-24"
                  type="number"
                  aria-label={`Trial ${i + 1} target in ${TRIAL_KIND_LABEL[t.kind].unit}`}
                  min={TRIAL_KIND_LABEL[t.kind].min}
                  max={TRIAL_KIND_LABEL[t.kind].max}
                  step={TRIAL_KIND_LABEL[t.kind].step}
                  value={t.target}
                  onChange={(e) => setTrials((list) => list.map((x, j) => (j === i ? { ...x, target: Math.round(Number(e.target.value) || 0) } : x)))}
                />
                <button type="button" aria-label={`Remove trial ${i + 1}`} onClick={() => setTrials((list) => list.filter((_, j) => j !== i))} className="rounded p-2 text-slate-500 hover:text-danger-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {trials.length < 3 && (
            <Button size="sm" variant="secondary" icon={Plus} className="mt-2" onClick={() => setTrials((list) => [...list, { kind: 'focus_minutes', target: 120 }])}>
              Add a trial
            </Button>
          )}
        </fieldset>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-gold-400" aria-label="Saving" />}
      </div>

      <ConfirmDialog
        open={closing}
        title={`Close ${club.name}?`}
        body="The club disappears from the world and its members are told. This cannot be undone from the app."
        confirmLabel="Close club"
        tone="danger"
        onCancel={() => setClosing(false)}
        onConfirm={() => {
          setClosing(false)
          void clubApi
            .close(club.slug)
            .then(() => {
              toast.success(`${club.name} is closed`)
              onClosed()
            })
            .catch((err) => toast.error('Could not close the club', messageOf(err)))
        }}
      />
    </Sheet>
  )
}
