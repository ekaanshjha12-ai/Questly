import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  IdCard,
  Loader2,
  MonitorSmartphone,
  Moon,
  MousePointer2,
  PartyPopper,
  Swords,
  Sun,
  UserRound,
} from 'lucide-react'
import type { AppState, CardDesign } from '../types'
import { useTheme, type ThemeChoice } from '../hooks/useTheme'
import { useCelebrations } from '../lib/prefs'
import { ApiError, avatarUrl, updateProfile, updateSettings, uploadAvatar, type AuthUser } from '../lib/api'
import { BIO_MAX, type PreparedAvatar } from '../lib/profile'
import { cardData } from '../lib/card'
import CursorPicker from './CursorPicker'
import CardEditor from './CardEditor'
import { PicturePicker } from './SignupFlow'

/**
 * How the app looks and feels, in one place.
 *
 * Only things that change the experience rather than the data: a name, the
 * theme, the cursor, and whether progress gets confetti. Everything except the
 * name is stored per device — the same person may want a quiet dark screen on a
 * phone at night and the sword and sparks on a desktop.
 */
export default function PersonaliseScreen({
  state,
  user,
  onRename,
  onSetCard,
  onUserChange,
}: {
  state: AppState
  user: AuthUser
  onRename: (name: string) => void
  onSetCard: (card: CardDesign | null) => void
  onUserChange: (user: AuthUser) => void
}) {
  const data = useMemo(() => cardData(state, user), [state, user])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-slate-50">Personalise</h2>
        <p className="mt-0.5 text-xs text-slate-500">Make it yours. Changes apply straight away.</p>
      </div>

      <Section icon={IdCard} title="Your card" note="Add stickers and text, drag things around, draw on it.">
        <CardEditor design={state.card} data={data} onChange={onSetCard} />
      </Section>

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

      <Section icon={PartyPopper} title="Celebrations" note="Confetti when you level up or reach a new rank.">
        <CelebrationToggle />
      </Section>
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
  { id: 'light', label: 'Light', icon: Sun, page: '#e6e6e6', card: '#ffffff' },
  { id: 'dark', label: 'Dark', icon: Moon, page: '#0b0b0b', card: '#1f1f1f' },
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
                  ? { background: 'linear-gradient(135deg, #e6e6e6 0 50%, #0b0b0b 50% 100%)' }
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
                  <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
                  <span
                    className="h-1 flex-1 rounded-full"
                    style={{ background: theme.id === 'light' ? '#d4d4d4' : '#3a3a3a' }}
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
        label={on ? 'Open — anyone your age can challenge you' : 'Closed — nobody can send you offers'}
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
