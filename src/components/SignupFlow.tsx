import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, Check, Eye, EyeOff, ImagePlus, Loader2, Swords, X } from 'lucide-react'
import {
  ApiError,
  checkUsername,
  signup,
  updateProfile,
  uploadAvatar,
  type AuthUser,
} from '../lib/api'
import {
  AVATAR_BACKDROPS,
  BIO_MAX,
  MIN_AGE,
  ageFromBirthdate,
  ageLocked,
  cropPhoto,
  lockForAge,
  makeAvatar,
  readFile,
  type PreparedAvatar,
} from '../lib/profile'

/**
 * Sign-up, one question at a time: email, name, username, password, birthday,
 * picture, bio.
 *
 * One question per screen because each has its own rules and its own way to
 * fail, and a single long form reports all of them at once at the bottom. Here
 * each answer is checked as it is given — the username against the server
 * while you type — so the final submit is very unlikely to bounce.
 *
 * The same flow, minus email and password, finishes the profile for an account
 * made before profiles existed.
 */

type Step = 'email' | 'name' | 'username' | 'password' | 'birthdate' | 'picture' | 'bio'

const SIGNUP_STEPS: Step[] = ['email', 'name', 'username', 'password', 'birthdate', 'picture', 'bio']
const COMPLETE_STEPS: Step[] = ['name', 'username', 'birthdate', 'picture', 'bio']

type Props =
  | {
      mode: 'signup'
      inviteRequired: boolean
      onSignedUp: (user: AuthUser, recoveryCode: string) => void
      onSwitchToLogin: () => void
    }
  | {
      mode: 'complete'
      initialName: string
      onCompleted: (user: AuthUser) => void
    }

const INPUT =
  'w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40'

export default function SignupFlow(props: Props) {
  const steps = props.mode === 'signup' ? SIGNUP_STEPS : COMPLETE_STEPS
  const [index, setIndex] = useState(0)
  const step = steps[index]

  const [email, setEmail] = useState('')
  const [name, setName] = useState(props.mode === 'complete' ? props.initialName : '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [avatar, setAvatar] = useState<PreparedAvatar | null>(null)
  const [bio, setBio] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(() => props.mode === 'signup' && ageLocked())

  const [usernameState, setUsernameState] = useState<
    { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'bad'; message: string }
  >({ kind: 'idle' })

  // Checked as you type, a beat after you stop, and only the latest answer is
  // kept — a slow reply for "nov" must not overwrite a fast one for "nova".
  const latest = useRef('')
  useEffect(() => {
    const value = username.trim()
    latest.current = value
    if (!value) {
      setUsernameState({ kind: 'idle' })
      return
    }
    setUsernameState({ kind: 'checking' })
    const t = setTimeout(() => {
      checkUsername(value)
        .then((r) => {
          if (latest.current !== value) return
          setUsernameState(r.available ? { kind: 'ok' } : { kind: 'bad', message: r.error ?? 'Not available.' })
        })
        .catch(() => {
          // Could not ask — do not block on it. The server checks again when
          // the account is created.
          if (latest.current === value) setUsernameState({ kind: 'ok' })
        })
    }, 350)
    return () => clearTimeout(t)
  }, [username])

  const age = useMemo(() => (birthdate ? ageFromBirthdate(birthdate) : null), [birthdate])
  const today = new Date().toISOString().slice(0, 10)

  const ready: Record<Step, boolean> = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    name: name.trim().length > 0 && name.trim().length <= 24,
    username: usernameState.kind === 'ok',
    password: password.length >= 8 && (!(props.mode === 'signup' && props.inviteRequired) || inviteCode.trim().length > 0),
    birthdate: age !== null && age >= 0,
    picture: avatar !== null,
    bio: bio.length <= BIO_MAX,
  }

  function go(delta: number) {
    setError(null)
    setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta)))
  }

  function jumpTo(target: Step, message: string) {
    setError(message)
    setIndex(Math.max(0, steps.indexOf(target)))
  }

  function next() {
    if (!ready[step] || busy) return
    if (step === 'birthdate' && age !== null && age < MIN_AGE) {
      if (props.mode === 'signup') lockForAge()
      setBlocked(true)
      return
    }
    if (index === steps.length - 1) {
      void finish()
      return
    }
    go(1)
  }

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      let user: AuthUser
      let recoveryCode = ''
      if (props.mode === 'signup') {
        const result = await signup({
          email: email.trim(),
          password,
          inviteCode: inviteCode.trim() || undefined,
          name: name.trim(),
          username: username.trim(),
          birthdate,
          bio: bio.trim() || undefined,
        })
        user = result.user
        recoveryCode = result.recoveryCode
      } else {
        const result = await updateProfile({
          name: name.trim(),
          username: username.trim(),
          birthdate,
          bio: bio.trim(),
        })
        user = result.user
      }

      // The account exists now; a failed picture upload should not undo that.
      // It can be added again from Personalise.
      if (avatar) {
        try {
          const { avatarVersion } = await uploadAvatar(avatar.base64, avatar.mediaType)
          user = { ...user, avatarVersion }
        } catch {
          // Leave avatarVersion as it was.
        }
      }

      if (props.mode === 'signup') props.onSignedUp(user, recoveryCode)
      else props.onCompleted(user)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      if (code === 'underage') {
        if (props.mode === 'signup') lockForAge()
        setBlocked(true)
      } else if (code === 'email_taken' || code === 'bad_invite') jumpTo(code === 'email_taken' ? 'email' : 'password', message)
      else if (code === 'username_taken' || code === 'bad_username') {
        setUsernameState({ kind: 'bad', message })
        jumpTo('username', message)
      } else if (code === 'bad_name') jumpTo('name', message)
      else if (code === 'bad_birthdate') jumpTo('birthdate', message)
      else if (code === 'bad_bio') jumpTo('bio', message)
      // No code on a 400 from sign-up means the password policy said no.
      else if (props.mode === 'signup' && err instanceof ApiError && err.status === 400) jumpTo('password', message)
      else setError(message)
    } finally {
      setBusy(false)
    }
  }

  if (blocked) {
    return (
      <Shell subtitle="Sorry about this">
        <div className="space-y-3 text-center">
          <p className="text-4xl" aria-hidden>
            🌱
          </p>
          <h2 className="text-lg font-semibold text-slate-100">Questly is for ages {MIN_AGE} and up</h2>
          <p className="text-sm text-slate-400">
            {props.mode === 'signup'
              ? `You can't create an account yet. We'd love to have you when you're ${MIN_AGE}.`
              : `This account can't be used until you're ${MIN_AGE}. We'd love to have you back then.`}
          </p>
          {props.mode === 'signup' && (
            <button type="button" onClick={props.onSwitchToLogin} className="text-xs text-slate-400 hover:text-gold-400">
              Already have an account? Sign in
            </button>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell subtitle={props.mode === 'signup' ? 'Create your account' : 'Finish your profile'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
        className="space-y-4"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {step === 'email' && (
              <Question title="What's your email?" hint="You'll sign in with this. We never show it to anyone.">
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  autoComplete="email"
                  name="email"
                  className={INPUT}
                />
              </Question>
            )}

            {step === 'name' && (
              <Question title="What should we call you?" hint="Your name in the app and on the leaderboard.">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={24}
                  autoComplete="given-name"
                  name="name"
                  className={INPUT}
                />
              </Question>
            )}

            {step === 'username' && (
              <Question title="Pick a username" hint="3–20 letters, numbers, dots or underscores.">
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').replace(/^@+/, '').slice(0, 20))}
                    placeholder="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="username"
                    className={`${INPUT} pl-10 pr-10`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {usernameState.kind === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                    {usernameState.kind === 'ok' && <Check className="h-4 w-4 text-gold-400" />}
                    {usernameState.kind === 'bad' && <X className="h-4 w-4 text-ember-400" />}
                  </span>
                </div>
                {usernameState.kind === 'bad' && <p className="text-xs text-ember-400">{usernameState.message}</p>}
                {usernameState.kind === 'ok' && <p className="text-xs text-gold-400">@{username.toLowerCase()} is yours if you want it.</p>}
              </Question>
            )}

            {step === 'password' && (
              <Question title="Create a password" hint="At least 8 characters. Longer is stronger.">
                <div className="relative">
                  <input
                    autoFocus
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="new-password"
                    name="password"
                    className={`${INPUT} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <StrengthBar password={password} />
                {props.mode === 'signup' && props.inviteRequired && (
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Invite code"
                    autoComplete="off"
                    name="inviteCode"
                    className={INPUT}
                  />
                )}
              </Question>
            )}

            {step === 'birthdate' && (
              <Question title="When's your birthday?" hint="Your year stays private — cards only ever show the day and month.">
                <input
                  autoFocus
                  type="date"
                  value={birthdate}
                  max={today}
                  min="1900-01-01"
                  onChange={(e) => setBirthdate(e.target.value)}
                  autoComplete="bday"
                  name="birthdate"
                  // The picker follows the page's color-scheme, which the theme
                  // tokens already set on the root.
                  className={INPUT}
                />
              </Question>
            )}

            {step === 'picture' && (
              <Question title="Add a profile picture" hint="Use a photo, or make one from your initial.">
                <PicturePicker name={name} value={avatar} onChange={setAvatar} />
              </Question>
            )}

            {step === 'bio' && (
              <Question title="Write a short bio" hint="Optional. What are you working on?">
                <textarea
                  autoFocus
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  rows={3}
                  placeholder="Training for my first half marathon 🏃"
                  className={`${INPUT} resize-none`}
                />
                <p className="text-right text-[11px] tabular-nums text-slate-500">
                  {bio.length}/{BIO_MAX}
                </p>
              </Question>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error}</p>
        )}

        <div className="flex gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={busy}
              className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-slate-300 hover:bg-ink-800 disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={!ready[step] || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-onAccent transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {index < steps.length - 1
              ? 'Continue'
              : props.mode === 'signup'
                ? bio.trim()
                  ? 'Create account'
                  : 'Skip & create account'
                : 'Save profile'}
          </button>
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={`h-1.5 w-5 rounded-full ${i <= index ? 'bg-gold-500' : 'bg-ink-600'}`} />
          ))}
        </div>
      </form>

      {props.mode === 'signup' && (
        <button
          type="button"
          onClick={props.onSwitchToLogin}
          className="mt-4 w-full text-center text-xs text-slate-400 transition-colors hover:text-gold-400"
        >
          Already have an account? Sign in
        </button>
      )}
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

function Shell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-850/80 p-7 shadow-2xl backdrop-blur"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-ember-500 shadow-glow">
            <Swords className="h-6 w-6 text-onAccent" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide text-gold-300">Questly</h1>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
        {children}
      </motion.div>
    </div>
  )
}

function Question({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-400">{hint}</p>
      </div>
      {children}
    </>
  )
}

/** A rough guide, not a rule — the server's policy is what decides. Length and
 * variety are what actually make a password hard to guess, so that is all it
 * measures. */
function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  const labels = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']
  const colors = ['bg-ember-500', 'bg-ember-500', 'bg-gold-600', 'bg-gold-500', 'bg-gold-500']
  return (
    <div>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? colors[score] : 'bg-ink-700'}`} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{labels[score]}</p>
    </div>
  )
}

const EMOJI_CHOICES = ['⚔️', '🌿', '🔥', '⭐', '🐉', '🎧', '📚', '🏃']

/**
 * Photo or made-to-order. A made one is picked by default, from the initial of
 * the name they just gave, so nobody is stopped here — but a photo is one tap
 * away.
 */
export function PicturePicker({
  name,
  value,
  onChange,
}: {
  name: string
  value: PreparedAvatar | null
  onChange: (avatar: PreparedAvatar) => void
}) {
  const initial = (name.trim()[0] ?? 'Q').toUpperCase()
  const [glyph, setGlyph] = useState(initial)
  const [backdrop, setBackdrop] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Regenerate whenever the made-up picture's options change.
  useEffect(() => {
    if (photo) return
    onChange(makeAvatar(glyph, AVATAR_BACKDROPS[backdrop]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyph, backdrop, photo])

  // Re-crop the photo when the zoom moves.
  useEffect(() => {
    if (!photo) return
    let cancelled = false
    cropPhoto(photo, zoom)
      .then((a) => !cancelled && onChange(a))
      .catch((err: Error) => !cancelled && setProblem(err.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, zoom])

  async function pick(file: File | undefined) {
    if (!file) return
    setProblem(null)
    try {
      setZoom(1)
      setPhoto(await readFile(file))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That picture could not be used.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-gold-500/60 bg-ink-800 shadow-lg">
          {value && <img src={value.dataUrl} alt="Your profile picture" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-medium text-slate-200 hover:border-gold-500/50"
          >
            <ImagePlus className="h-4 w-4" />
            {photo ? 'Choose another photo' : 'Upload a photo'}
          </button>
          {photo && (
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200"
            >
              Use a made-up picture instead
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {photo ? (
        <label className="block text-[11px] text-slate-500">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="mt-1 w-full accent-[rgb(var(--gold-500))]"
          />
        </label>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[initial, ...EMOJI_CHOICES].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGlyph(g)}
                aria-pressed={glyph === g}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base ${
                  glyph === g ? 'border-gold-500 bg-gold-500/10' : 'border-ink-600 bg-ink-800'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {AVATAR_BACKDROPS.map((pair, i) => (
              <button
                key={pair.join()}
                type="button"
                onClick={() => setBackdrop(i)}
                aria-label={`Background ${i + 1}`}
                aria-pressed={backdrop === i}
                className={`h-7 w-7 rounded-full ${backdrop === i ? 'ring-2 ring-slate-50 ring-offset-2 ring-offset-ink-850' : ''}`}
                style={{ background: `linear-gradient(135deg, ${pair[0]}, ${pair[1]})` }}
              />
            ))}
          </div>
        </>
      )}

      {problem && <p className="text-xs text-ember-400">{problem}</p>}
    </div>
  )
}
