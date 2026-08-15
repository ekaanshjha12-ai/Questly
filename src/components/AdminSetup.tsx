import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Copy, Loader2, ShieldCheck } from 'lucide-react'
import { ApiError, completeSetup, fetchSetupInfo, fetchSetupSecret, type SetupInfo } from '../lib/api'

/**
 * Claims a privileged account from a one-time link.
 *
 * The password is chosen here and nowhere else — it is never typed at a
 * terminal, put in an environment variable, or sent to anyone. The link only
 * proves who is allowed to set one.
 *
 * The token rides in the URL *fragment*, which browsers never send with a
 * request, so loading this page cannot leak it to a proxy or a Referer header.
 * It is read into memory and stripped from the address bar at once, so a
 * screenshot or a glance at the URL bar cannot capture it either. The API calls
 * that follow do carry it in a path and will appear in the server's own access
 * log — acceptable for a single-use token that expires in thirty minutes, and
 * visible only to whoever already runs the server.
 */
function readTokenFromUrl(): string {
  const raw = window.location.hash.replace(/^#/, '').trim()
  if (!raw) return ''
  // Clear it from the bar so a shoulder-surfer or a screenshot cannot reuse it.
  window.history.replaceState(null, '', window.location.pathname)
  return raw
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  )
}

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="flex w-full items-center gap-2 rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-left font-mono text-sm text-slate-100 transition-colors hover:border-gold-500/50"
    >
      <span className="min-w-0 flex-1 break-all">{value}</span>
      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-slate-500" />
      )}
    </button>
  )
}

export default function AdminSetup() {
  const [token, setToken] = useState(readTokenFromUrl)
  const [typed, setTyped] = useState('')
  const [info, setInfo] = useState<SetupInfo | null>(null)
  const [secret, setSecret] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [done, setDone] = useState<{ recoveryCode: string; backupCodes: string[] } | null>(null)

  useEffect(() => {
    // No token yet — the code form below is shown instead.
    if (!token) return
    void (async () => {
      try {
        const [i, s] = await Promise.all([fetchSetupInfo(token), fetchSetupSecret(token)])
        setInfo(i)
        setSecret(s.secret)
      } catch (err) {
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? 'That code is invalid, already used, or has expired. Issue a new one with: npm run admin -- link <email>'
            : 'Could not load the setup page.',
        )
      }
    })()
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await completeSetup(token, password, secret, code)
      setDone({ recoveryCode: result.recoveryCode, backupCodes: result.backupCodes })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete setup.')
    } finally {
      setBusy(false)
    }
  }

  // Reached by typing the code rather than following the link. The deploy
  // console does not reliably allow selecting or clicking text, so this is the
  // route that always works.
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) setToken(typed.trim())
          }}
          className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-900 p-6"
        >
          <ShieldCheck className="h-7 w-7 text-gold-400" />
          <h1 className="mt-3 font-display text-xl font-bold text-slate-50">Enter your setup code</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            The code printed when the account was created. Case and dashes do not matter.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            autoFocus
            placeholder="XXXX-XXXX-XXXX"
            className="mt-4 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-center font-mono text-lg tracking-widest text-slate-100 outline-none focus:border-gold-500/60"
          />
          <button
            type="submit"
            disabled={typed.replace(/[^A-Za-z0-9]/g, '').length < 8}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </form>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-ember-500/40 bg-ink-900 p-6 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-ember-400" />
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{loadError}</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-2xl border border-gold-500/40 bg-ink-900 p-6"
        >
          <ShieldCheck className="h-7 w-7 text-emerald-400" />
          <h1 className="mt-3 font-display text-xl font-bold text-slate-50">Account ready</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Save both of these now. This is the only time either is shown — they are stored hashed, so nobody,
            including the server, can read them back.
          </p>

          <div className="mt-5 space-y-4">
            <Field label="Recovery code — resets your password if you lose it">
              <CopyableCode value={done.recoveryCode} />
            </Field>

            <Field label="Backup codes — sign in if you lose your phone. Each works once.">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {done.backupCodes.map((c) => (
                  <span
                    key={c}
                    className="rounded-lg border border-ink-600 bg-ink-950 px-2.5 py-1.5 text-center font-mono text-xs text-slate-200"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Field>
          </div>

          <a
            href="/"
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent"
          >
            Go to sign in
          </a>
        </motion.div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-5 rounded-2xl border border-ink-600 bg-ink-900 p-6"
      >
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gold-400">{info.role} setup</p>
          <h1 className="mt-1 font-display text-xl font-bold text-slate-50">Set up {info.email}</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Choose a password and add two-factor authentication. Both are required before this account can sign in.
          </p>
        </div>

        <Field label={`Password — at least ${info.minPassword} characters`}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={info.minPassword}
            required
            className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-500/60"
          />
        </Field>

        <Field label="Confirm password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-500/60"
          />
        </Field>

        <div className="rounded-xl border border-mystic-400/30 bg-mystic-500/5 p-4">
          <p className="text-sm font-semibold text-slate-100">Two-factor authentication</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            In your authenticator app choose &ldquo;enter a setup key&rdquo; and paste this. Then type the six-digit
            code it shows, to prove it saved correctly.
          </p>

          <div className="mt-3">
            <CopyableCode value={secret.replace(/(.{4})/g, '$1 ').trim()} />
          </div>

          <div className="mt-3">
            <Field label="Six-digit code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                required
                className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-100 outline-none focus:border-gold-500/60"
              />
            </Field>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.length !== 6 || password.length < info.minPassword}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? 'Setting up…' : 'Finish setup'}
        </button>
      </motion.form>
    </div>
  )
}
