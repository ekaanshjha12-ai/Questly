import { LifeBuoy, Lock, ScrollText, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import type { PolicySlug } from '../../lib/api'

/** The documents and where they live, for menus and headers before the text arrives. */
export const POLICY_LINKS: { slug: PolicySlug; title: string; blurb: string; icon: LucideIcon }[] = [
  { slug: 'safety', title: 'Safety Centre', blurb: 'Blocking, reporting and staying safe', icon: ShieldCheck },
  { slug: 'guidelines', title: 'Community Guidelines', blurb: 'What is welcome here, and what is not', icon: Users },
  { slug: 'terms', title: 'Terms of Service', blurb: 'The agreement for using Questly', icon: ScrollText },
  { slug: 'privacy', title: 'Privacy Policy', blurb: 'What Questly keeps, why, and your choices', icon: Lock },
]

export const SUPPORT_LINK = { to: '/support', title: 'Contact & support', blurb: 'Report a problem or ask a question', icon: LifeBuoy }

export function policyTitle(slug: string): string {
  return POLICY_LINKS.find((p) => p.slug === slug)?.title ?? 'Document'
}
