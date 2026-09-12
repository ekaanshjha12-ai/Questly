import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Swords, Loader2, KeyRound, Copy, Check, Sparkles } from 'lucide-react'
import { authConfig, login, resetPassword, type AuthUser, ApiError } from '../lib/api'
import { hydrate } from '../lib/storage'
import { cardData, defaultCard } from '../lib/card'
import SignupFlow from './SignupFlow'
import ProfileCard from './ProfileCard'

interface Props {
  onAuthed: (user: AuthUser) => void
}

type Mode = 'login' | 'signup' | 'reset'

export default function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteRequired, setInviteRequired] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  /** Held after signup so the code can be shown once before entering the app. */
  const [issuedCode, setIssuedCode] = useState<{ code: string; user: AuthUser } | null>(null)
  /** Then the card, before the app itself. */
  const [revealFor, setRevealFor] = useState<AuthUser | null>(null)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Revealed only once the server says this account has a second factor, so an
  // ordinary user never sees a field that does not apply to them.
  const [mfaWanted, setMfaWanted] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [busy, setBusy] = useState(false)

  // Only ask for a code if this deployment actually gates signup.
  useEffect(() => {
    let cancelled = false
    authConfig()
      .then((cfg) => {
        if (!cancelled) setInviteRequired(cfg.inviteRequired)
      })
      .catch(() => {
        // Older server or a blip — fall back to not showing the field. The
        // server still rejects a bad code, so this cannot bypass the gate.
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      if (mode === 'reset') {
        await resetPassword(email, recoveryInput, password)
        setNotice('Password changed. Sign in with your new one.')
        setMode('login')
        setRecoveryInput('')
        setPassword('')
        return
      }
      const { user } = await login(email, password, mfaCode || undefined)
      onAuthed(user)
    } catch (err) {
      // An account with a second factor answers the first attempt with this
      // rather than a failure — the password was right, the form is simply
      // not finished yet. Showing it as an error would read as a rejection.
      if (err instanceof ApiError && err.code === 'mfa_required' && !mfaWanted) {
        setMfaWanted(true)
        setError(null)
        return
      }
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (revealFor) {
    return <CardReveal user={revealFor} onContinue={() => onAuthed(revealFor)} />
  }

  if (issuedCode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl border border-gold-500/50 bg-ink-850/90 p-6 shadow-2xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gold-400" />
            <h1 className="font-display text-lg font-bold text-gold-300">Save your recovery code</h1>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            This is the only way to get back in if you forget your password. It is shown once and cannot
            be retrieved later — screenshot it or write it down now.
          </p>

          <p className="my-4 select-all rounded-xl border border-ink-600 bg-ink-950 px-3 py-3 text-center font-mono text-base tracking-widest text-slate-100">
            {issuedCode.code}
          </p>

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(issuedCode.code).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2 text-xs text-slate-300 transition-colors hover:border-gold-500/50 hover:text-gold-300"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy code'}
          </button>

          <button
            type="button"
            onClick={() => setRevealFor(issuedCode.user)}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-onAccent hover:opacity-90"
          >
            I've saved it — continue
          </button>
        </motion.div>
      </div>
    )
  }

  if (mode === 'signup') {
    return (
      <SignupFlow
        mode="signup"
        inviteRequired={inviteRequired}
        onSignedUp={(user, code) => setIssuedCode({ user, code })}
        onSwitchToLogin={() => {
          setMode('login')
          setError(null)
          setNotice(null)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-850/80 p-8 shadow-2xl backdrop-blur"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-ember-500 shadow-glow">
            <Swords className="h-6 w-6 text-onAccent" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide text-gold-300">Questly</h1>
            <p className="text-xs text-slate-400">
              {mode === 'reset' ? 'Enter your recovery code to set a new password' : 'Welcome back, hero'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="Email"
            autoComplete="email"
            name="email"
            className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            placeholder={mode === 'reset' ? 'New password (8+ characters)' : 'Password'}
            autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
            name="password"
            className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
          />

          {mode === 'reset' && (
            <input
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              required
              placeholder="Recovery code"
              name="recoveryCode"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 font-mono text-sm tracking-wider text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
            />
          )}

          {mode === 'login' && mfaWanted && (
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">
                Authentication code
              </label>
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus
                className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-100 outline-none focus:border-gold-500/60"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                From your authenticator app, or one of your backup codes.
              </p>
            </div>
          )}

          {notice && (
            <p className="rounded-lg border border-mystic-400/40 bg-mystic-500/10 px-3 py-2 text-xs text-mystic-300">
              {notice}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-onAccent transition-opacity disabled:cursor-not-allowed disabled:opacity-60 hover:opacity-90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'reset' ? 'Set new password' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode('signup')
            setError(null)
            setNotice(null)
          }}
          className="mt-4 w-full text-center text-xs text-slate-400 transition-colors hover:text-gold-400"
        >
          New here? Create an account
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'reset' ? 'login' : 'reset'))
            setError(null)
            setNotice(null)
          }}
          className="mt-2 w-full text-center text-[11px] text-slate-500 transition-colors hover:text-slate-300"
        >
          {mode === 'reset' ? 'Back to sign in' : 'Forgot your password?'}
        </button>
      </motion.div>
    </div>
  )
}

/**
 * The first look at their card, straight after sign-up: everything they just
 * told us, with the XP and rank they are starting from.
 */
function CardReveal({ user, onContinue }: { user: AuthUser; onContinue: () => void }) {
  const data = useMemo(
    () =>
      cardData(
        hydrate({ player: { name: user.displayName ?? 'Adventurer', character: 'female', xp: 0, coins: 0, createdAt: new Date().toISOString() } }),
        user,
      ),
    [user],
  )
  const design = useMemo(() => defaultCard(), [])

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-[0.2em] text-gold-400"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Your card
        </motion.p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">Welcome, {data.name}</h1>

        <motion.div
          initial={{ opacity: 0, rotateY: -80, scale: 0.9 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 }}
          className="mx-auto mt-5 w-full max-w-[18rem]"
          style={{ perspective: 900 }}
        >
          <ProfileCard design={design} data={data} />
        </motion.div>

        <p className="mt-5 text-sm text-slate-400">
          It grows with you. Find it in <span className="text-slate-200">Personalise</span> to add stickers, move
          things around and draw on it.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-semibold text-onAccent hover:opacity-90"
        >
          Let's go
        </button>
      </div>
    </div>
  )
}
