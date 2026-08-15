import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Copy, Loader2, ShieldCheck } from 'lucide-react'
import { ApiError, completeSetup, fetchSetupInfo, type SetupInfo } from '../lib/api'

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
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [done, setDone] = useState<{ recoveryCode: string } | null>(null)

  useEffect(() => {
    // No token yet — the code form below is shown instead.
    if (!token) return
    void (async () => {
      try {
        setInfo(await fetchSetupInfo(token))
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
      const result = await completeSetup(token, password)
      setDone({ recoveryCode: result.recoveryCode })
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
            Save this now. It is the only time it is shown — it is stored hashed, so nobody, including the
            server, can read it back. Without it a forgotten password means a lost account.
          </p>

          <div className="mt-5 space-y-4">
            <Field label="Recovery code — resets your password if you lose it">
              <CopyableCode value={done.recoveryCode} />
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
            Choose a password. It is the only thing protecting this account, so make it long and unique — not
            one you use anywhere else.
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

        {error && (
          <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || password.length < info.minPassword}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? 'Setting up…' : 'Finish setup'}
        </button>
      </motion.form>
    </div>
  )
}
