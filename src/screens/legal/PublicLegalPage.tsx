import BrandMark from '../../components/ui/BrandMark'
import { match, useRouter } from '../../app/router'
import LegalHubScreen from './LegalHubScreen'
import PolicyScreen from './PolicyScreen'
import SupportScreen from './SupportScreen'
import { POLICY_LINKS } from './legalLinks'

/**
 * The policy pages and Contact & support for someone who is not signed in:
 * before sign-up, from a link in a new tab, or locked out of an account.
 */
export default function PublicLegalPage() {
  const { path, navigate } = useRouter()
  const doc = match('/legal/:slug', path)

  return (
    <div className="min-h-dvh px-4 pb-10 pt-6">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
            className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold-300"
          >
            <BrandMark size={36} />
            Questly
          </a>
          <button type="button" onClick={() => navigate('/')} className="btn-secondary ml-auto min-h-[40px] px-3 text-xs">
            Sign in or join
          </button>
        </header>

        {path === '/support' ? (
          <>
            <h1 className="page-title mb-4">Contact & support</h1>
            <SupportScreen signedIn={false} />
          </>
        ) : doc ? (
          <PolicyScreen slug={doc.slug} showTitle />
        ) : (
          <>
            <h1 className="page-title mb-4">Help, safety and legal</h1>
            <LegalHubScreen signedIn={false} />
          </>
        )}

        <footer className="mt-10 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] text-slate-500">
          {POLICY_LINKS.map((p) => (
            <button key={p.slug} type="button" onClick={() => navigate(`/legal/${p.slug}`)} className="hover:text-slate-300">
              {p.title}
            </button>
          ))}
          <button type="button" onClick={() => navigate('/support')} className="hover:text-slate-300">
            Contact & support
          </button>
        </footer>
      </div>
    </div>
  )
}
