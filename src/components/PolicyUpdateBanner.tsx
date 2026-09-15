import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { acceptPolicies, type AuthUser } from '../lib/api'
import { useRouter } from '../app/router'
import { useToast } from './ui/Toast'
import Button from './ui/Button'

const SHORT: Record<string, string> = { terms: 'Terms', privacy: 'Privacy Policy' }

/**
 * Shown when there are Terms or a Privacy Policy this account has not accepted:
 * the first versions, for accounts made before they existed, or a change
 * significant enough to ask everyone again. It does not lock the app; it stays
 * until accepted.
 */
export default function PolicyUpdateBanner({ user, onUserChange }: { user: AuthUser; onUserChange: (user: AuthUser) => void }) {
  const { navigate } = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const updates = user.policyUpdates ?? []
  if (!updates.length) return null

  const names = updates.map((u) => u.title).join(' and ')
  const changed = updates.some((u) => u.version > 1)

  async function accept() {
    setBusy(true)
    try {
      const { pending } = await acceptPolicies()
      onUserChange({ ...user, policyUpdates: pending })
    } catch (err) {
      toast.error('Could not save that', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/10 px-3.5 py-3">
      <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{changed ? `We have updated the ${names}` : `Please review the ${names}`}</p>
        <p className="mt-0.5 text-[12px] text-slate-300">
          Read{' '}
          {updates.map((u, i) => (
            <span key={u.slug}>
              {i > 0 && ' and '}
              <a
                href={`/legal/${u.slug}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(`/legal/${u.slug}`)
                }}
                className="font-semibold text-gold-300 underline decoration-gold-500/40 underline-offset-2"
              >
                the {SHORT[u.slug] ?? u.title}
              </a>
            </span>
          ))}
          , then accept to carry on using Questly.
        </p>
      </div>
      <Button size="sm" loading={busy} onClick={() => void accept()} className="shrink-0 self-center">
        Accept
      </Button>
    </div>
  )
}
