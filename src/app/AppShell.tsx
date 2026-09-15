import type { ReactNode } from 'react'
import { m as motion } from 'framer-motion'
import { ArrowLeft, Bell, Castle, CircleUserRound, House, LibraryBig, UsersRound, Zap, type LucideIcon } from 'lucide-react'
import { Link, useRouter } from './router'
import { NowPlayingButton } from './NowPlaying'
import { useGame } from '../game/GameProvider'
import HeroPortrait from '../components/art/HeroPortrait'
import { XpBar } from '../components/ui/Bars'
import BrandMark from '../components/ui/BrandMark'

/**
 * The frame around every signed-in screen: a bottom navigation bar on a phone,
 * a sidebar on a wide screen, and the page in between. Focus Mode takes the
 * whole screen, so the frame steps away for it.
 */

export interface NavItem {
  id: string
  to: string
  label: string
  icon: LucideIcon
  /** Paths that light this item up. */
  match: (path: string) => boolean
  badge?: number
}

export function useNavItems({ socialBadge = 0, challengeBadge = 0 }: { socialBadge?: number; challengeBadge?: number }): NavItem[] {
  return [
    { id: 'home', to: '/', label: 'Home', icon: House, match: (p) => p === '/' || p.startsWith('/focus') || p.startsWith('/notifications') || p.startsWith('/world') },
    {
      id: 'quests',
      to: '/quests',
      label: 'Quests',
      icon: LibraryBig,
      match: (p) => ['/quests', '/planner', '/habits', '/study', '/ai-plan', '/goals', '/sounds'].some((x) => p.startsWith(x)) },
    { id: 'social', to: '/social', label: 'Social', icon: UsersRound, match: (p) => p.startsWith('/social') || p.startsWith('/u/'), badge: socialBadge },
    { id: 'challenges', to: '/challenges', label: 'Challenges', icon: Zap, match: (p) => p.startsWith('/challenges') || p.startsWith('/leaderboard'), badge: challengeBadge },
    { id: 'clubs', to: '/clubs', label: 'Clubs', icon: Castle, match: (p) => p.startsWith('/clubs') },
    { id: 'profile', to: '/profile', label: 'Profile', icon: CircleUserRound, match: (p) => p.startsWith('/profile') },
  ]
}

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[9px] font-bold leading-none text-onAccent ring-2 ring-ink-950">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function BottomNav({ items }: { items: NavItem[] }) {
  const { path } = useRouter()
  return (
    <nav aria-label="Main" className="safe-nav fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/80 bg-ink-950/95 backdrop-blur-md lg:hidden">
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-1">
        {items.map((item) => {
          const active = item.match(path)
          const Icon = item.icon
          return (
            <li key={item.id} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.02em] transition-colors min-[400px]:text-[9.5px] min-[400px]:tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400 ${
                  active ? 'text-gold-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {active && (
                  <motion.span layoutId="nav-active" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                )}
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  <Badge count={item.badge ?? 0} />
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SideNav({ items }: { items: NavItem[] }) {
  const { path } = useRouter()
  const { snapshot } = useGame()
  const progress = snapshot?.progress
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-ink-700/70 bg-ink-950/90 px-3 py-5 backdrop-blur lg:flex">
      <Link to="/" className="mb-6 flex items-center gap-2.5 px-3">
        <BrandMark size={38} />
        <span className="font-display text-2xl font-bold italic text-slate-50">Questly</span>
      </Link>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = item.match(path)
          const Icon = item.icon
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                  active ? 'bg-gold-500/10 text-gold-300' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-100'
                }`}
              >
                {active && <motion.span layoutId="side-active" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold-400" />}
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden />
                  <Badge count={item.badge ?? 0} />
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
      {progress && (
        <Link to="/profile" className="panel mt-auto flex items-center gap-3 p-3 hover:border-ink-500">
          <HeroPortrait look={snapshot?.look} size={40} ring="border-gold-500/50" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-slate-200">{progress.rank.name}</span>
              <span className="font-pixel text-[10px] text-gold-400">LV {progress.level}</span>
            </span>
            <XpBar value={progress.xpIntoLevel} max={progress.xpForNext} className="mt-1.5 !h-1.5" label="XP toward next level" />
          </span>
        </Link>
      )}
    </nav>
  )
}

/** The bell and portrait at the top right of every page. */
export function HeaderActions() {
  const { snapshot } = useGame()
  const unread = snapshot?.notifications.unread ?? 0
  return (
    <div className="flex items-center gap-2">
      <NowPlayingButton />
      <Link
        to="/notifications"
        aria-label={unread ? `Chronicle Log, ${unread} unread` : 'Chronicle Log'}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-reward-400 px-1 text-[9px] font-bold text-[#281a04] ring-2 ring-ink-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
      <Link to="/profile" aria-label="Your profile" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 lg:hidden">
        <HeroPortrait look={snapshot?.look} size={40} ring="border-reward-500/60" />
      </Link>
    </div>
  )
}

/** The page title block: italic serif title, a line beneath, actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <header className="safe-header mb-5 flex items-start gap-3 lg:pt-8">
      <div className="min-w-0 flex-1">
        {back}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-400">{subtitle}</p>}
      </div>
      {actions ?? <HeaderActions />}
    </header>
  )
}

/** A back link for the line above a page title. */
export function BackLink({ to, label }: { to: string; label: string }) {
  const { back } = useRouter()
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        back(to)
      }}
      className="mb-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {label}
    </a>
  )
}

export default function AppShell({
  children,
  immersive = false,
  socialBadge = 0,
  challengeBadge = 0,
}: {
  children: ReactNode
  /** Focus Mode: no navigation, nothing to tap away to. */
  immersive?: boolean
  socialBadge?: number
  challengeBadge?: number
}) {
  const items = useNavItems({ socialBadge, challengeBadge })
  if (immersive) return <div className="min-h-dvh">{children}</div>
  return (
    <div className="min-h-dvh">
      <SideNav items={items} />
      <main className="page-foot mx-auto w-full max-w-3xl px-4 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))] lg:ml-60 lg:w-auto lg:max-w-none lg:px-10">
        <div className="mx-auto w-full max-w-3xl xl:max-w-5xl">{children}</div>
      </main>
      <BottomNav items={items} />
    </div>
  )
}
