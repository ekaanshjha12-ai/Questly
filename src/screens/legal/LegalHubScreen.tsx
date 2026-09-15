import { useEffect, useState } from 'react'
import { ChevronRight, Download, ShieldAlert } from 'lucide-react'
import { fetchPolicies, type PolicySummary } from '../../lib/api'
import { useRouter } from '../../app/router'
import { POLICY_LINKS, SUPPORT_LINK } from './legalLinks'

/** Everything about safety, rules and data in one place, with the way to reach a person. */
export default function LegalHubScreen({ signedIn }: { signedIn: boolean }) {
  const [policies, setPolicies] = useState<PolicySummary[] | null>(null)
  const { navigate } = useRouter()

  useEffect(() => {
    fetchPolicies()
      .then((res) => setPolicies(res.policies))
      .catch(() => setPolicies([]))
  }, [])

  const rows = [
    ...POLICY_LINKS.map((p) => {
      const summary = policies?.find((s) => s.slug === p.slug)
      return {
        to: `/legal/${p.slug}`,
        title: summary?.title ?? p.title,
        blurb: p.blurb,
        icon: p.icon,
        meta: summary ? `Updated ${new Date(summary.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : null,
      }
    }),
    { ...SUPPORT_LINK, meta: null },
    ...(signedIn
      ? [
          { to: '/profile/settings', title: 'Download your data', blurb: 'Everything Questly holds about you, as a file', icon: Download, meta: null },
          { to: '/profile/settings', title: 'Delete your account', blurb: 'In Settings, under Account and data', icon: ShieldAlert, meta: null },
        ]
      : []),
  ]

  return (
    <ul className="space-y-2">
      {rows.map(({ to, title, blurb, icon: Icon, meta }) => (
        <li key={title}>
          <a
            href={to}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              navigate(to)
            }}
            className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-ink-600 bg-ink-850 px-3.5 py-3 hover:border-ink-500"
          >
            <span className="icon-well flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800">
              <Icon className="h-4 w-4 text-gold-400" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-100">{title}</span>
              <span className="block text-[12px] text-slate-400">{blurb}</span>
            </span>
            {meta && <span className="hidden shrink-0 text-[11px] text-slate-500 min-[420px]:inline">{meta}</span>}
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  )
}
