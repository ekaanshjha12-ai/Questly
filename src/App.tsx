import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LazyMotion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAppState, type Notebook } from './hooks/useAppState'
import type { AppState, PlanItemInput } from './types'
import { ApiError, fetchState, game as gameApi, logout as logoutRequest, me, type AuthUser, type Challenge, type GameQuest } from './lib/api'
import { clearCachedState, forgetUser, loadCachedState, recallUser, rememberUser } from './lib/storage'
import InstallPrompt from './components/InstallPrompt'
import { ToastProvider, messageOf, useToast } from './components/ui/Toast'
import { LoadingState } from './components/ui/States'
import { GameProvider, useGame } from './game/GameProvider'
import { match, RouterProvider, useRouter } from './app/router'
import AppShell, { BackLink, PageHeader } from './app/AppShell'
import { NowPlayingProvider } from './app/NowPlaying'
import PolicyUpdateBanner from './components/PolicyUpdateBanner'
import HomeScreen from './screens/home/HomeScreen'
import QuestBoardScreen from './screens/quests/QuestBoardScreen'
import RewardLayer from './screens/rewards/RewardLayer'
import { useNoise } from './hooks/useNoise'
import { useTheme } from './hooks/useTheme'
import { useChallenges } from './hooks/useChallenges'
import { useMessages } from './hooks/useMessages'
import { useCelebrations } from './lib/prefs'
import { MUSIC } from './lib/musicCatalog'
import { SOUNDS } from './lib/noise'

// Screens away from the hub load when first opened, so the first paint carries
// only the shell, Home and the Quest Board.
const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default)

// Signed-in players never need the sign-in screens, and confetti only on a level-up.
const AuthScreen = lazy(() => import('./components/AuthScreen'))
const SignupFlow = lazy(() => import('./components/SignupFlow'))
const Celebration = lazy(() => import('./components/Celebration'))
const Onboarding = lazy(() => import('./screens/onboarding/OnboardingScreen'))
const AdminSetup = lazy(() => import('./components/AdminSetup'))
const AdminConsole = lazy(() => import('./components/AdminConsole'))
const FocusModeScreen = lazy(() => import('./screens/focus/FocusModeScreen'))
const TimerScreen = lazy(() => import('./screens/focus/TimerScreen'))
const SocialHome = lazy(() => import('./components/social/SocialHome'))
const ChallengesScreen = lazy(() => import('./components/ChallengesScreen'))
const Leaderboard = lazy(() => import('./components/Leaderboard'))
const ProfileScreen = lazy(() => import('./screens/profile/ProfileScreen'))
const WardrobeScreen = lazy(() => import('./screens/profile/WardrobeScreen'))
const AchievementsScreen = lazy(() => import('./screens/profile/AchievementsScreen'))
const XpHistoryScreen = lazy(() => import('./screens/profile/XpHistoryScreen'))
const ProgressScreen = lazy(() => import('./components/ProgressScreen'))
const ChronicleLogScreen = lazy(() => import('./screens/notifications/ChronicleLogScreen'))
const WorldMapScreen = lazy(() => import('./screens/world/WorldMapScreen'))
const ClubsScreen = lazy(() => import('./screens/clubs/ClubsScreen'))
const ClubScreen = lazy(() => import('./screens/clubs/ClubScreen'))
const Planner = lazy(() => import('./components/Planner'))
const HabitTracker = lazy(() => import('./components/HabitTracker'))
const StudyScreen = lazy(() => import('./components/StudyScreen'))
const AiPlanner = lazy(() => import('./components/AiPlanner'))
const GoalsManager = lazy(() => import('./components/GoalsManager'))
const SoundsScreen = lazy(() => import('./components/SoundsScreen'))
const PersonaliseScreen = lazy(() => import('./components/PersonaliseScreen'))
const CardDesigner = lazy(() => import('./components/PersonaliseScreen').then((m) => ({ default: m.CardDesigner })))
const PolicyScreen = lazy(() => import('./screens/legal/PolicyScreen'))
const LegalHubScreen = lazy(() => import('./screens/legal/LegalHubScreen'))
const SupportScreen = lazy(() => import('./screens/legal/SupportScreen'))
const PublicLegalPage = lazy(() => import('./screens/legal/PublicLegalPage'))

/** Pages anyone can open, signed in or not: the policies and Contact & support. */
const isLegalPath = (path: string) => path === '/legal' || path.startsWith('/legal/') || path === '/support'

/** Where the website sends people: join, or sign in. Both land on the hub once they are in. */
const DOORS = new Set(['/join', '/signin'])

type Boot =
  | { phase: 'loading' }
  | { phase: 'anonymous' }
  | { phase: 'ready'; user: AuthUser; initialState: AppState | null }
  | { phase: 'error'; message: string }

function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-4 text-center text-sm text-slate-400">{children}</div>
}

function Spinner() {
  return (
    <FullScreenMessage>
      <Loader2 className="h-5 w-5 animate-spin text-gold-400" aria-label="Loading" />
    </FullScreenMessage>
  )
}

/**
 * Pages that sit outside the signed-in app. Read once: neither navigates
 * client-side, and the server serves the app for any non-API path.
 */
function standalonePath(): 'admin-setup' | 'admin' | null {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/admin-setup') return 'admin-setup'
  if (path === '/admin') return 'admin'
  return null
}

export default function App() {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <RouterProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </RouterProvider>
    </LazyMotion>
  )
}

function Root() {
  const [route] = useState(standalonePath)
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' })
  const { path, navigate } = useRouter()
  // Keeps a system-theme choice following the device while the app is open.
  useTheme()

  const loadForUser = useCallback(async (user: AuthUser) => {
    rememberUser({ id: user.id, email: user.email })
    // In by one of the website's doors: the hub is where they land. Any other
    // path is a deep link they asked for, and is left alone.
    if (DOORS.has(window.location.pathname.replace(/\/+$/, ''))) navigate('/', { replace: true })
    try {
      const { state } = await fetchState()
      setBoot({ phase: 'ready', user, initialState: state })
    } catch {
      // Server unreachable — fall back to this user's own cached copy so the
      // app still opens offline.
      setBoot({ phase: 'ready', user, initialState: loadCachedState(user.id) })
    }
  }, [navigate])

  useEffect(() => {
    // The claim page is reached before any account can sign in, so it must not
    // wait on — or be redirected by — the session check.
    if (route === 'admin-setup') return
    let cancelled = false
    ;(async () => {
      try {
        const { user } = await me()
        if (cancelled) return
        await loadForUser(user)
      } catch (err) {
        if (cancelled) return
        // A 401 is a real answer: the server is up and says you're signed out.
        if (err instanceof ApiError && err.status === 401) {
          forgetUser()
          setBoot({ phase: 'anonymous' })
          return
        }
        // Anything else means the server could not be reached. If this device
        // has been signed in before, open that account from cache rather than
        // showing a dead end.
        const remembered = recallUser()
        const cached = remembered ? loadCachedState(remembered.id) : null
        if (remembered && cached) {
          setBoot({ phase: 'ready', user: remembered, initialState: cached })
          return
        }
        setBoot({
          phase: 'error',
          message: navigator.onLine
            ? 'Could not reach Questly. The server may be restarting — try again shortly.'
            : "You're offline. Connect to the internet to sign in for the first time.",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadForUser, route])

  // The console gates itself: the API answers 404 to anyone who is not an admin.
  if (route === 'admin-setup' || route === 'admin') {
    return <Suspense fallback={<Spinner />}>{route === 'admin' ? <AdminConsole /> : <AdminSetup />}</Suspense>
  }

  if (boot.phase === 'loading') return <Spinner />
  // The policies and support have to be reachable before there is an account,
  // and by someone who cannot get into theirs.
  if (isLegalPath(path) && (boot.phase !== 'ready' || boot.user.profileComplete === false)) {
    return (
      <Suspense fallback={<Spinner />}>
        <PublicLegalPage />
      </Suspense>
    )
  }
  if (boot.phase === 'error') return <FullScreenMessage>{boot.message}</FullScreenMessage>
  if (boot.phase === 'anonymous') {
    return (
      <Suspense fallback={<Spinner />}>
        <AuthScreen start={path === '/signin' ? 'login' : 'signup'} onAuthed={(user) => void loadForUser(user)} />
      </Suspense>
    )
  }

  // Accounts made before profiles existed finish one before anything else.
  // Strictly `false`: a user recalled from cache for an offline start has no
  // profile fields at all, and being offline must not lock them out.
  if (boot.user.profileComplete === false) {
    return (
      <Suspense fallback={<Spinner />}>
        <SignupFlow mode="complete" initialName={boot.initialState?.player?.name ?? ''} onCompleted={(user) => setBoot({ ...boot, user })} />
      </Suspense>
    )
  }

  const onSignedOut = () => setBoot({ phase: 'anonymous' })
  return (
    // Remounting per user guarantees no state bleeds between accounts.
    <GameProvider key={boot.user.id} userId={boot.user.id} onSignedOut={onSignedOut}>
      <SignedInApp
        user={boot.user}
        initialState={boot.initialState}
        onSignedOut={onSignedOut}
        onUserChange={(user) => setBoot((current) => (current.phase === 'ready' ? { ...current, user } : current))}
      />
    </GameProvider>
  )
}

function SignedInApp({
  user,
  initialState,
  onSignedOut,
  onUserChange,
}: {
  user: AuthUser
  initialState: AppState | null
  onSignedOut: () => void
  onUserChange: (user: AuthUser) => void
}) {
  const game = useGame()
  const toast = useToast()
  const { path } = useRouter()
  const notebook = useAppState(user.id, initialState, {
    onRewards: game.applyRewards,
    // New goals get their quests on the server's next look at the board.
    onGoalsSaved: () => void game.refresh(),
  })
  const { state, syncStatus } = notebook

  // Goals, habits, the planner and the card save in the background; say so
  // when a save fails rather than letting the player assume it stuck.
  useEffect(() => {
    if (syncStatus === 'error') toast.error('Changes not saved', 'Questly could not reach the server. They will save with your next change once you are back online.')
  }, [syncStatus, toast])

  // Polled for the whole session: an offer should badge the navigation wherever
  // you are, and a settled challenge's XP should show without going to look.
  const challengeFeed = useChallenges({ enabled: user.profileComplete === true, onSettled: () => void game.refresh() })
  const inbox = useMessages({ enabled: user.profileComplete === true, fast: path.startsWith('/social') })

  // Lives here rather than in a screen so sound keeps playing between screens.
  const noise = useNoise()
  const nowPlaying =
    [MUSIC.find((m) => m.id === noise.music)?.name, SOUNDS.find((s) => s.id === noise.ambience)?.name].filter(Boolean).join(' + ') || null

  const handleSignOut = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Even if the call fails, drop the local copy and return to sign-in.
    }
    clearCachedState(user.id)
    // Also drop the remembered account, or an offline start would reopen the
    // session the user just signed out of.
    forgetUser()
    onSignedOut()
    // A full load, so the front door — the website, when signed out — is served afresh.
    window.location.assign('/')
  }, [onSignedOut, user.id])

  if (!state.onboarded) {
    return (
      <Suspense fallback={<Spinner />}>
        <Onboarding name={user.displayName ?? state.player.name} birthdate={user.birthdate} onComplete={notebook.onboard} />
      </Suspense>
    )
  }

  return (
    <NowPlayingProvider value={{ label: nowPlaying, getLevel: noise.getLevel }}>
      <AppShell immersive={path === '/focus'} socialBadge={inbox.unread + inbox.requests} challengeBadge={challengeFeed.incomingCount}>
        {path !== '/focus' && !isLegalPath(path) && <PolicyUpdateBanner user={user} onUserChange={onUserChange} />}
        <Suspense fallback={<LoadingState lines={3} label="Opening" />}>
          <Routes
            user={user}
            notebook={notebook}
            challengeFeed={challengeFeed}
            inbox={inbox}
            noise={noise}
            nowPlaying={nowPlaying}
            onUserChange={onUserChange}
            onSignOut={() => void handleSignOut()}
          />
        </Suspense>
      </AppShell>
      <RewardLayer />
      <LevelConfetti />
      <InstallPrompt />
    </NowPlayingProvider>
  )
}

/** A page reached from a hub: a back link, a title, then the tool. */
function ToolPage({ title, subtitle, back, children }: { title: string; subtitle?: string; back: { to: string; label: string }; children: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} back={<BackLink to={back.to} label={back.label} />} />
      {children}
    </div>
  )
}

const POLICY_TITLES: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  guidelines: 'Community Guidelines',
  safety: 'Safety Centre',
}

const TO_QUESTS = { to: '/quests', label: 'Quests' }
const TO_PROFILE = { to: '/profile', label: 'Profile' }

function Routes({
  user,
  notebook,
  challengeFeed,
  inbox,
  noise,
  nowPlaying,
  onUserChange,
  onSignOut,
}: {
  user: AuthUser
  notebook: Notebook
  challengeFeed: ReturnType<typeof useChallenges>
  inbox: ReturnType<typeof useMessages>
  noise: ReturnType<typeof useNoise>
  nowPlaying: string | null
  onUserChange: (user: AuthUser) => void
  onSignOut: () => void
}) {
  const game = useGame()
  const toast = useToast()
  const { path, navigate, back } = useRouter()
  const { state } = notebook
  const quests = game.snapshot?.quests ?? []

  /** The planner's tick: a quest finished by ticking is completed; anything
   * measured (focus minutes, counts, steps) opens so it can be done properly. */
  const toggleQuest = useCallback(
    async (quest: GameQuest) => {
      if (quest.progress.kind !== 'check' || (quest.status !== 'active' && quest.status !== 'in_progress')) {
        navigate(`/quests/${encodeURIComponent(quest.id)}`)
        return
      }
      try {
        await game.completeQuest(quest.id)
      } catch (err) {
        toast.error(messageOf(err, 'Could not complete that quest.'))
      }
    },
    [game, navigate, toast],
  )

  const addPlanned = useCallback(
    async (title: string, date: string, block?: string) => {
      try {
        const quest = await game.createQuest({ type: 'optional', title, durationMin: 15 })
        notebook.scheduleTask('todo', quest.id, date, block)
      } catch (err) {
        toast.error(messageOf(err, 'Could not add that quest.'))
      }
    },
    [game, notebook, toast],
  )

  const applyPlan = useCallback(
    async (items: PlanItemInput[]) => {
      const { quests: created } = await gameApi.createPlanQuests(items.map(({ title, kind }) => ({ title, kind })))
      const placements = items.flatMap((item, i) => (item.placement && created[i] ? [{ refId: created[i].id, date: item.placement.date, block: item.placement.block }] : []))
      notebook.addScheduleEntries(placements)
      await game.refreshQuests().catch(() => undefined)
    },
    [game, notebook],
  )

  if (path === '/') return <HomeScreen name={state.player.name} challenges={challengeFeed.challenges} />
  if (path === '/quests' || path === '/quests/new' || match('/quests/:id', path)) return <QuestBoardScreen goals={state.goals} />
  if (path === '/timer') return <TimerScreen goals={state.goals} nowPlaying={nowPlaying} />
  if (path === '/focus') return <FocusModeScreen nowPlaying={nowPlaying} />
  if (path === '/notifications') return <ChronicleLogScreen />
  if (path === '/world') return <WorldMapScreen />
  if (path === '/clubs' || path === '/clubs/new') return <ClubsScreen />
  if (match('/clubs/:slug', path) || match('/clubs/:slug/:tab', path)) return <ClubScreen state={state} user={user} />

  if (path === '/sounds') {
    return (
      <ToolPage title="Sounds" subtitle="Music and ambience that keeps playing across Questly" back={TO_QUESTS}>
        <SoundsScreen noise={noise} />
      </ToolPage>
    )
  }
  if (path === '/planner') {
    return (
      <ToolPage title="Planner" subtitle="Place your quests on the days you will do them" back={TO_QUESTS}>
        <Planner
          state={state}
          quests={quests}
          onSchedule={notebook.scheduleTask}
          onMove={notebook.moveScheduleEntry}
          onUnschedule={notebook.unschedule}
          onAddPlanned={(title, date, block) => void addPlanned(title, date, block)}
          onToggleQuest={(quest) => void toggleQuest(quest)}
        />
      </ToolPage>
    )
  }
  if (path === '/habits') {
    return (
      <ToolPage title="Habits" subtitle="Streaks, moods and what you did each day" back={TO_QUESTS}>
        <HabitTracker
          state={state}
          onAddHabit={notebook.addHabit}
          onRenameHabit={notebook.renameHabit}
          onRecolorHabit={notebook.recolorHabit}
          onDeleteHabit={notebook.deleteHabit}
          onToggleMark={notebook.toggleHabitMark}
          onSetMood={notebook.setMood}
        />
      </ToolPage>
    )
  }
  if (path === '/study') {
    return (
      <ToolPage title="Study" subtitle="Flashcards, and explaining it back" back={TO_QUESTS}>
        <StudyScreen
          state={state}
          onAddDeck={notebook.addDeck}
          onDeleteDeck={notebook.deleteDeck}
          onUpdateCard={notebook.updateCard}
          onDeleteCard={notebook.deleteCard}
          onAddCard={notebook.addCard}
          onAddReport={notebook.addReport}
          onDeleteReport={notebook.deleteReport}
        />
      </ToolPage>
    )
  }
  if (path === '/ai-plan') {
    return (
      <ToolPage title="AI Planner" subtitle="Describe a goal, answer a few questions, get a dated plan" back={TO_QUESTS}>
        <AiPlanner onApplyPlan={applyPlan} onOpenPlanner={() => navigate('/planner')} />
      </ToolPage>
    )
  }
  if (path === '/goals') {
    return (
      <ToolPage title="Goals" subtitle="What your quests are working towards" back={TO_QUESTS}>
        <GoalsManager goals={state.goals} onAddGoal={notebook.addGoal} onArchiveGoal={notebook.archiveGoal} />
      </ToolPage>
    )
  }

  if (path === '/social' || path.startsWith('/social/') || match('/u/:username', path)) {
    return (
      <div>
        <PageHeader title="Adventure Log" subtitle="What everyone is working on" />
        <SocialHome state={state} user={user} inbox={inbox} />
      </div>
    )
  }

  const duel = match('/challenges/:id', path)
  if (path === '/challenges' || duel) {
    return (
      <div>
        <PageHeader title="Challenges" subtitle="Duel someone. Finish what you agreed. Earn XP." />
        <ChallengesScreen
          myName={state.player.name}
          challenges={challengeFeed.challenges}
          error={challengeFeed.error}
          onRefresh={challengeFeed.refresh}
          onUpsert={(c: Challenge) => {
            challengeFeed.upsert(c)
            if (c.status === 'completed' || c.status === 'failed') void game.refresh()
          }}
          openId={duel?.id ?? null}
          onOpenChange={(id) => (id ? navigate(`/challenges/${encodeURIComponent(id)}`, { keepScroll: true }) : back('/challenges'))}
        />
      </div>
    )
  }
  if (path === '/leaderboard') {
    return (
      <ToolPage title="Leaderboard" subtitle="Ranked by XP" back={{ to: '/challenges', label: 'Challenges' }}>
        <Leaderboard myName={state.player.name} />
      </ToolPage>
    )
  }

  if (path === '/profile') return <ProfileScreen user={user} goals={state.goals} challenges={challengeFeed.challenges} />
  if (path === '/profile/wardrobe') return <WardrobeScreen />
  if (path === '/profile/achievements') return <AchievementsScreen />
  if (path === '/profile/history') return <XpHistoryScreen />
  if (path === '/profile/progress') {
    return (
      <ToolPage title="Progress" subtitle="Your record, and an honest read on where it leads" back={TO_PROFILE}>
        <ProgressScreen outlook={state.outlook} onSetOutlook={notebook.setOutlook} />
      </ToolPage>
    )
  }
  if (path === '/profile/card') {
    return (
      <ToolPage title="Questly Card" subtitle="What other players see when they open you" back={TO_PROFILE}>
        <CardDesigner state={state} user={user} progress={game.snapshot?.progress ?? null} look={game.snapshot?.look ?? null} onSetCard={notebook.setCard} />
      </ToolPage>
    )
  }
  if (path === '/legal') {
    return (
      <ToolPage title="Help, safety and legal" subtitle="How Questly works, what it keeps, and how to reach a person" back={{ to: '/profile/settings', label: 'Settings' }}>
        <LegalHubScreen signedIn />
      </ToolPage>
    )
  }
  const legalDoc = match('/legal/:slug', path)
  if (legalDoc) {
    return (
      <ToolPage title={POLICY_TITLES[legalDoc.slug] ?? 'Document'} back={{ to: '/legal', label: 'Help, safety and legal' }}>
        <PolicyScreen slug={legalDoc.slug} />
      </ToolPage>
    )
  }
  if (path === '/support') {
    return (
      <ToolPage title="Contact & support" subtitle="Report a problem, ask a question, or raise a concern" back={{ to: '/legal', label: 'Help, safety and legal' }}>
        <SupportScreen signedIn />
      </ToolPage>
    )
  }
  if (path === '/profile/settings') {
    return (
      <ToolPage title="Settings" subtitle="Profile, look and feel, account and data" back={TO_PROFILE}>
        <PersonaliseScreen state={state} user={user} onRename={notebook.renamePlayer} onUserChange={onUserChange} onSignOut={onSignOut} />
      </ToolPage>
    )
  }

  return <NotFound />
}

function NotFound() {
  const { navigate } = useRouter()
  return (
    <div className="pt-16 text-center">
      <p className="eyebrow">Uncharted</p>
      <h1 className="page-title mt-2">This path leads nowhere</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">The page you were looking for does not exist, or has moved.</p>
      <button type="button" onClick={() => navigate('/', { replace: true })} className="btn-primary mt-6">
        Back to the hub
      </button>
    </div>
  )
}

/** Confetti for a level-up, unless switched off in Settings. */
function LevelConfetti() {
  const { celebrations } = useGame()
  const [enabled] = useCelebrations()
  const [burst, setBurst] = useState<{ key: number; big: boolean }>({ key: 0, big: false })
  const seen = useRef(new Set<string>())

  useEffect(() => {
    for (const c of celebrations) {
      if (c.type !== 'level' || seen.current.has(c.id)) continue
      seen.current.add(c.id)
      setBurst((b) => ({ key: b.key + 1, big: c.rankChanged }))
    }
  }, [celebrations])

  if (!enabled || burst.key === 0) return null
  return (
    <Suspense fallback={null}>
      <Celebration burstKey={burst.key} intensity={burst.big ? 'big' : 'normal'} />
    </Suspense>
  )
}
