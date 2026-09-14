import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Download,
  IdCard,
  Loader2,
  LogOut,
  MessageCircle,
  MonitorSmartphone,
  Moon,
  MousePointer2,
  PartyPopper,
  ShieldAlert,
  Swords,
  Sun,
  UserRound,
} from 'lucide-react'
import type { AppState, CardDesign } from '../types'
import { useTheme, type ThemeChoice } from '../hooks/useTheme'
import { useCelebrations } from '../lib/prefs'
import { ApiError, avatarUrl, deleteAccount, updateProfile, updateSettings, uploadAvatar, type AuthUser, type Look, type Progress } from '../lib/api'
import { BIO_MAX, ageFromBirthdate, type PreparedAvatar } from '../lib/profile'
import { cardData } from '../lib/card'
import CursorPicker from './CursorPicker'
import CardEditor from './CardEditor'
import { PicturePicker } from './SignupFlow'
import { Sheet } from './ui/Sheet'
import Button from './ui/Button'

/**
 * How the app looks and feels, in one place.
 *
 * Only things that change the experience rather than the data: a name, the
 * theme, the cursor, and whether progress gets confetti. Everything except the
 * name is stored per device — the same person may want a quiet dark screen on a
 * phone at night and the sword and sparks on a desktop.
 */
/** The card designer on its own page: design, drag, draw. */
export function CardDesigner({
  state,
  user,
  progress,
  look,
  onSetCard,
}: {
  state: AppState
  user: AuthUser
  progress: Progress | null
  look: Look | null
  onSetCard: (card: CardDesign | null) => void
}) {
  const data = useMemo(() => cardData(state, user, { progress, look }), [state, user, progress, look])
  return (
    <Section icon={IdCard} title="Your Questly Card" note="Add your character, stats, stickers and text, drag and resize them, or draw on it. Your age always shows in the corner.">
      <CardEditor design={state.card} data={data} onChange={onSetCard} />
    </Section>
  )
}

export default function PersonaliseScreen({
  state,
  user,
  onRename,
  onUserChange,
  onSignOut,
}: {
  state: AppState
  user: AuthUser
  onRename: (name: string) => void
  onUserChange: (user: AuthUser) => void
  onSignOut: () => void
}) {
  return (
    <div className="space-y-4">
      <Section icon={UserRound} title="Profile" note="Your picture, name and bio — they update your card too.">
        <ProfileFields state={state} user={user} onRename={onRename} onUserChange={onUserChange} />
      </Section>

      <Section icon={Sun} title="Theme" note="The day/night switch on the side does the same thing.">
        <ThemePicker />
      </Section>

      <Section icon={MousePointer2} title="Cursor" note="Hover a tile to try it before you pick.">
        <CursorPicker />
      </Section>

      <Section icon={Swords} title="Challenges" note="Whether other players can send you challenge offers.">
        <ChallengesToggle user={user} onUserChange={onUserChange} />
      </Section>

      {user.birthdate && (ageFromBirthdate(user.birthdate) ?? 18) < 18 && (
        <Section icon={MessageCircle} title="Contact from adults" note="Whether players who are 18 or older can message you or send you challenges.">
          <AdultMessagesToggle user={user} onUserChange={onUserChange} />
        </Section>
      )}

      <Section icon={PartyPopper} title="Celebrations" note="Confetti when you level up or reach a new rank.">
        <CelebrationToggle />
      </Section>

      <Section icon={ShieldAlert} title="Account and data" note="Your data is yours. Download everything Questly holds about you, or delete the account for good.">
        <AccountControls user={user} onSignOut={onSignOut} />
      </Section>
    </div>
  )
}

/**
 * Export, sign out, delete. Deleting needs the password: a signed-in phone
 * left on a table should not be enough to erase someone's history.
 */
function AccountControls({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setProblem(null)
    try {
      await deleteAccount(password)
      onSignOut()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not delete the account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <a
        href="/api/account/export"
        download="questly-export.json"
        className="flex min-h-[44px] items-center gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-slate-200 hover:border-ink-500"
      >
        <Download className="h-4 w-4 text-gold-400" /> Download my data
      </a>
      <button type="button" onClick={onSignOut} className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 text-left text-sm text-slate-200 hover:border-ink-500">
        <LogOut className="h-4 w-4 text-slate-400" /> Sign out of {user.email}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-danger-500/40 bg-danger-500/10 px-3 text-left text-sm text-danger-400 hover:bg-danger-500/15"
      >
        <ShieldAlert className="h-4 w-4" /> Delete account
      </button>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep account
            </Button>
            <Button variant="danger" size="sm" loading={busy} disabled={!password} onClick={() => void remove()}>
              Delete forever
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-300">
          This permanently deletes your account, progress, quests, items, posts, messages and challenges. It cannot be undone. Download your data first if you want a copy.
        </p>
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor="delete-password">
          Confirm with your password
        </label>
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mt-1.5"
        />
        {problem && <p className="mt-2 text-xs text-danger-400">{problem}</p>}
      </Sheet>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Section({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: typeof Sun
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
      <div className="flex items-start gap-2.5">
        <span className="icon-well flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-800">
          <Icon className="h-4 w-4 text-gold-400" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-[11px] text-slate-500">{note}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * Picture, name, username and bio.
 *
 * The picture and bio live with the account on the server, so they save
 * through their own requests; the name is part of the game state like before.
 * The username is shown but not editable here — it is the one handle other
 * features may come to rely on, so changing it deserves more than a text box.
 */
function ProfileFields({
  state,
  user,
  onRename,
  onUserChange,
}: {
  state: AppState
  user: AuthUser
  onRename: (name: string) => void
  onUserChange: (user: AuthUser) => void
}) {
  const [picking, setPicking] = useState(false)
  const [picture, setPicture] = useState<PreparedAvatar | null>(null)
  const [savingPicture, setSavingPicture] = useState(false)
  const [bio, setBio] = useState(user.bio ?? '')
  const [savingBio, setSavingBio] = useState(false)
  const [bioSaved, setBioSaved] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => setBio(user.bio ?? ''), [user.bio])

  useEffect(() => {
    if (!bioSaved) return
    const t = setTimeout(() => setBioSaved(false), 1600)
    return () => clearTimeout(t)
  }, [bioSaved])

  async function savePicture() {
    if (!picture) return
    setSavingPicture(true)
    setProblem(null)
    try {
      const { avatarVersion } = await uploadAvatar(picture.base64, picture.mediaType)
      onUserChange({ ...user, avatarVersion })
      setPicking(false)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not save that picture.')
    } finally {
      setSavingPicture(false)
    }
  }

  async function saveBio() {
    setSavingBio(true)
    setProblem(null)
    try {
      const { user: updated } = await updateProfile({ bio: bio.trim() })
      onUserChange({ ...user, ...updated })
      setBioSaved(true)
    } catch (err) {
      setProblem(err instanceof ApiError || err instanceof Error ? err.message : 'Could not save your bio.')
    } finally {
      setSavingBio(false)
    }
  }

  const current = avatarUrl(user.avatarVersion)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-gold-500/60 bg-ink-800">
          {current ? (
            <img src={current} alt="Your profile picture" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-slate-300">
              {state.player.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{state.player.name}</p>
          {user.username && <p className="truncate text-xs text-slate-500">@{user.username}</p>}
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="mt-1 text-xs font-medium text-gold-400 hover:text-gold-300"
          >
            {picking ? 'Cancel' : 'Change picture'}
          </button>
        </div>
      </div>

      {picking && (
        <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
          <PicturePicker name={state.player.name} value={picture} onChange={setPicture} />
          <button
            type="button"
            onClick={() => void savePicture()}
            disabled={!picture || savingPicture}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2 text-xs font-semibold text-onAccent disabled:opacity-40"
          >
            {savingPicture && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save picture
          </button>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">Name</p>
        <NameField name={state.player.name} onRename={onRename} />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">Bio</p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          rows={2}
          placeholder="What are you working on?"
          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-slate-500">
            {bio.length}/{BIO_MAX}
          </span>
          <button
            type="button"
            onClick={() => void saveBio()}
            disabled={savingBio || bio.trim() === (user.bio ?? '')}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gold-400 hover:text-gold-300 disabled:text-slate-500"
          >
            {savingBio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : bioSaved ? <Check className="h-3.5 w-3.5" /> : null}
            {bioSaved ? 'Saved' : 'Save bio'}
          </button>
        </div>
      </div>

      {problem && <p className="text-xs text-ember-400">{problem}</p>}
    </div>
  )
}

/**
 * Saved when you leave the field or press Enter, not on every keystroke — each
 * change to the state is a save to the server, and half-typed names are not
 * worth sending.
 */
function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name)
  const [saved, setSaved] = useState(false)
  const editing = useRef(false)
  // Escape resets the draft and blurs, and blurring commits. The draft reset has
  // not rendered yet when the blur fires, so without this flag Escape would save
  // exactly what it was meant to throw away.
  const cancelled = useRef(false)

  // Follow a rename made elsewhere (another device syncing in) unless the user
  // is part-way through typing their own.
  useEffect(() => {
    if (!editing.current) setDraft(name)
  }, [name])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1600)
    return () => clearTimeout(t)
  }, [saved])

  function commit() {
    editing.current = false
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    if (!next) {
      setDraft(name)
      return
    }
    if (next !== name) {
      onRename(next)
      setSaved(true)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          editing.current = true
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(name)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        maxLength={24}
        aria-label="Your name"
        className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
      />
      <span
        className={`flex shrink-0 items-center gap-1 text-[11px] text-gold-400 transition-opacity ${
          saved ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
      >
        <Check className="h-3.5 w-3.5" />
        {saved ? 'Saved' : ''}
      </span>
    </div>
  )
}

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun; page: string; card: string }[] = [
  { id: 'dark', label: 'Night', icon: Moon, page: '#090b0c', card: '#1b2024' },
  { id: 'light', label: 'Parchment', icon: Sun, page: '#ece4d3', card: '#faf6ea' },
  { id: 'system', label: 'Match device', icon: MonitorSmartphone, page: '', card: '' },
]

/** The three-way choice the switch on the rail cannot offer — "match my device"
 * lives here, since a switch only has two positions. */
function ThemePicker() {
  const { choice, setChoice } = useTheme()

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((theme) => {
        const Icon = theme.icon
        const active = choice === theme.id
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setChoice(theme.id)}
            aria-pressed={active}
            className={`rounded-xl border p-2 text-left transition-colors ${
              active ? 'border-gold-500 bg-gold-500/10' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
            }`}
          >
            {/* A miniature of the page: ground, a card, and the green accent. */}
            <span
              className="relative block h-12 overflow-hidden rounded-lg border border-ink-600"
              style={
                theme.id === 'system'
                  ? { background: 'linear-gradient(135deg, #ece4d3 0 50%, #090b0c 50% 100%)' }
                  : { background: theme.page }
              }
              aria-hidden
            >
              {theme.id === 'system' ? (
                <>
                  <span className="absolute left-2 top-2 h-3 w-8 rounded-sm bg-white" />
                  <span className="absolute bottom-2 right-2 h-3 w-8 rounded-sm" style={{ background: '#1f1f1f' }} />
                </>
              ) : (
                <span
                  className="absolute inset-x-2 top-2 flex h-6 items-center gap-1 rounded-md px-1.5"
                  style={{ background: theme.card }}
                >
                  <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                  <span
                    className="h-1 flex-1 rounded-full"
                    style={{ background: theme.id === 'light' ? '#d8c7a6' : '#3a4248' }}
                  />
                </span>
              )}
            </span>
            <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-200">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{theme.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * For under-18 accounts: whether adults can reach them at all. On by default,
 * since social is open across age groups; turning it off hides the account
 * from adults looking for people, stops their messages and challenges, and
 * closes any chats with adults already going.
 */
function AdultMessagesToggle({ user, onUserChange }: { user: AuthUser; onUserChange: (user: AuthUser) => void }) {
  const on = user.adultMessages !== false
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setProblem(null)
    try {
      const { user: updated } = await updateSettings({ adultMessages: !on })
      onUserChange({ ...user, ...updated })
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SwitchRow
        on={on}
        busy={busy}
        onToggle={() => void toggle()}
        label={on ? 'On — adults can message and challenge you' : 'Off — only players under 18 can reach you'}
      />
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        Nothing starts until you accept, chats with adults can't include contact details or links, and you can block or report anyone.
      </p>
      {problem && <p className="mt-1.5 text-xs text-ember-400">{problem}</p>}
    </>
  )
}

/** Stored on the server, since it is other people's requests it controls —
 * the setting has to hold on every device, not just this one. */
function ChallengesToggle({ user, onUserChange }: { user: AuthUser; onUserChange: (user: AuthUser) => void }) {
  const on = user.challengesOpen !== false
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setProblem(null)
    try {
      const { user: updated } = await updateSettings({ challengesOpen: !on })
      onUserChange({ ...user, ...updated })
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SwitchRow
        on={on}
        busy={busy}
        onToggle={() => void toggle()}
        label={on ? 'Open — anyone can challenge you' : 'Closed — nobody can send you offers'}
      />
      {problem && <p className="mt-1.5 text-xs text-ember-400">{problem}</p>}
    </>
  )
}

function SwitchRow({ on, busy = false, onToggle, label }: { on: boolean; busy?: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-left disabled:opacity-60"
    >
      <span className="text-xs text-slate-200">{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-gold-500' : 'bg-ink-600'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

function CelebrationToggle() {
  const [on, setOn] = useCelebrations()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-left"
    >
      <span className="text-xs text-slate-200">{on ? 'On' : 'Off'}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-gold-500' : 'bg-ink-600'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
