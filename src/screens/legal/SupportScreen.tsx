import { useEffect, useState } from 'react'
import { CheckCircle2, Flag, Mail, Send } from 'lucide-react'
import { ApiError, fetchMySupportRequests, fetchPolicies, sendSupportRequest, type SupportKind, type SupportRequest } from '../../lib/api'
import { useRouter } from '../../app/router'
import Button from '../../components/ui/Button'

const KINDS: { id: SupportKind; label: string }[] = [
  { id: 'problem', label: 'Something is not working' },
  { id: 'account', label: 'Account or sign-in' },
  { id: 'safety', label: 'Safety concern' },
  { id: 'privacy', label: 'Privacy or my data' },
  { id: 'feedback', label: 'Idea or feedback' },
  { id: 'other', label: 'Something else' },
]
const BODY_MAX = 2000

const kindLabel = (kind: SupportKind) => KINDS.find((k) => k.id === kind)?.label ?? 'Request'

/**
 * Contact & support. From inside an account a message needs nothing else; from
 * outside — locked out, suspended, a parent — it needs an address to reply to.
 * Reporting a person or a post is done where they are, so the report keeps
 * what was said; this page says so rather than taking a second, emptier copy.
 */
export default function SupportScreen({ signedIn }: { signedIn: boolean }) {
  const { search, navigate } = useRouter()
  const preset = KINDS.some((k) => k.id === search.get('kind')) ? (search.get('kind') as SupportKind) : null
  const [kind, setKind] = useState<SupportKind | null>(preset)
  const [body, setBody] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [mine, setMine] = useState<SupportRequest[] | null>(null)

  useEffect(() => {
    fetchPolicies()
      .then((res) => setEmail(res.contact.email))
      .catch(() => setEmail(null))
    if (signedIn) {
      fetchMySupportRequests()
        .then((res) => setMine(res.requests))
        .catch(() => setMine([]))
    }
  }, [signedIn])

  const from = search.get('from')
  const ready = Boolean(kind) && body.trim().length >= 10 && (signedIn || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()))

  async function send() {
    if (!ready || !kind || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendSupportRequest({ kind, body: body.trim(), ...(from && /^\/[\w/-]*$/.test(from) ? { page: from } : {}), ...(signedIn ? {} : { contact: contact.trim() }) })
      setSent(true)
      setBody('')
      if (signedIn) setMine((await fetchMySupportRequests()).requests)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'That could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Flag className="h-4 w-4 text-danger-400" aria-hidden /> Reporting a person, post or message?
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
          Use <span className="text-slate-200">Report</span> on their card, the post, the comment or the conversation — it sends a copy of what was said, which helps the team act faster. If anyone is in immediate danger, contact your local emergency services.
        </p>
        <button
          type="button"
          onClick={() => navigate('/legal/safety')}
          className="mt-2 text-[13px] font-semibold text-gold-300 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-200"
        >
          Open the Safety Centre
        </button>
      </div>

      {sent ? (
        <div role="status" className="rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <CheckCircle2 className="h-4 w-4 text-gold-400" aria-hidden /> Sent to the Questly team
          </p>
          <p className="mt-1 text-[13px] text-slate-300">
            {signedIn ? 'When someone replies, it arrives in your Chronicle Log and shows below.' : `We will reply to ${contact.trim()}.`}
          </p>
          <button type="button" onClick={() => setSent(false)} className="mt-2 text-[13px] font-semibold text-gold-300 hover:text-gold-200">
            Send another
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="rounded-2xl border border-ink-600 bg-ink-850 p-4"
        >
          <p className="font-display text-sm font-semibold text-slate-100">Write to the Questly team</p>
          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">What is it about?</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${kind === k.id ? 'border-gold-500 bg-gold-500/15 text-slate-50' : 'border-ink-600 bg-ink-800 text-slate-300 hover:border-ink-500'}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="support-body" className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Tell us what happened
          </label>
          <textarea
            id="support-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            rows={6}
            placeholder={kind === 'problem' ? 'What were you doing, what did you expect, and what happened instead?' : 'The more detail, the better we can help.'}
            className="field mt-1.5 resize-y"
          />
          <p className="mt-1 text-right text-[11px] tabular-nums text-slate-500">
            {body.length}/{BODY_MAX}
          </p>

          {!signedIn && (
            <>
              <label htmlFor="support-contact" className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Email to reply to
              </label>
              <input
                id="support-contact"
                type="email"
                autoComplete="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="field mt-1.5"
              />
              <p className="mt-1 text-[11px] text-slate-500">Used only to answer this request.</p>
            </>
          )}

          {error && <p className="mt-3 rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}

          <div className="mt-4 flex justify-end">
            <Button type="submit" icon={Send} loading={busy} disabled={!ready}>
              Send
            </Button>
          </div>
        </form>
      )}

      {email && (
        <a href={`mailto:${email}`} className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-ink-600 bg-ink-850 px-4 text-sm text-slate-200 hover:border-ink-500">
          <Mail className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <span className="min-w-0 flex-1">
            Prefer email? <span className="font-semibold text-slate-100">{email}</span>
          </span>
        </a>
      )}

      {signedIn && mine && mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Your requests</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="rounded-2xl border border-ink-600 bg-ink-850 p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-slate-200">{kindLabel(r.kind)}</span>
                  <span className="text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                  <span
                    className={`ml-auto rounded-full border px-2 py-0.5 font-semibold ${r.status === 'open' ? 'border-info-400/40 bg-info-400/10 text-info-400' : 'border-ink-600 bg-ink-800 text-slate-400'}`}
                  >
                    {r.status === 'open' ? 'Waiting for a reply' : 'Closed'}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px] text-slate-300">{r.body}</p>
                {r.reply && (
                  <div className="mt-2 rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gold-300">The Questly team</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-200">{r.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
