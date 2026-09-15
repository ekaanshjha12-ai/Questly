import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { fetchPolicy, type PolicyDocument } from '../../lib/api'
import { useRouter } from '../../app/router'
import Markdown from '../../components/ui/Markdown'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { POLICY_LINKS, SUPPORT_LINK, policyTitle } from './legalLinks'

/**
 * One policy document, as the server has it now. The text is edited in the
 * admin console, so nothing here is baked into the app.
 */
export default function PolicyScreen({ slug, showTitle = false }: { slug: string; showTitle?: boolean }) {
  const [doc, setDoc] = useState<PolicyDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const { navigate } = useRouter()

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    fetchPolicy(slug)
      .then((res) => !cancelled && setDoc(res.policy))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'That document could not be loaded.'))
    return () => {
      cancelled = true
    }
  }, [slug, attempt])

  const updated = doc ? new Date(doc.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <div className="space-y-4">
      {showTitle && (
        <header>
          <p className="eyebrow">Questly</p>
          <h1 className="page-title mt-1">{doc?.title ?? policyTitle(slug)}</h1>
        </header>
      )}

      {error && <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />}
      {!doc && !error && <LoadingState lines={6} label="Opening the document" />}

      {doc && (
        <article className="rounded-2xl border border-ink-600 bg-ink-850 px-4 py-5 sm:px-6">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Last updated {updated} · version {doc.version}
          </p>
          <Markdown source={doc.body} onNavigate={(path) => navigate(path)} />
        </article>
      )}

      <nav aria-label="Other documents" className="grid gap-2 sm:grid-cols-2">
        {[...POLICY_LINKS.filter((p) => p.slug !== slug).map((p) => ({ to: `/legal/${p.slug}`, title: p.title, icon: p.icon })), { to: SUPPORT_LINK.to, title: SUPPORT_LINK.title, icon: SUPPORT_LINK.icon }].map(
          ({ to, title, icon: Icon }) => (
            <a
              key={to}
              href={to}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                navigate(to)
              }}
              className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-slate-200 hover:border-ink-500"
            >
              <Icon className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            </a>
          ),
        )}
      </nav>
    </div>
  )
}
