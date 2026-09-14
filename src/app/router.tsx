import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'

/**
 * A small history router.
 *
 * Every screen has a real URL — shareable, refreshable, and the phone's back
 * gesture does what it should — without a routing dependency for what is a
 * dozen patterns. The server already answers any non-API path with the app.
 */

interface RouterValue {
  path: string
  search: URLSearchParams
  navigate: (to: string, options?: { replace?: boolean; keepScroll?: boolean }) => void
  back: (fallback?: string) => void
}

const RouterContext = createContext<RouterValue | null>(null)

function current() {
  return { path: window.location.pathname.replace(/\/+$/, '') || '/', search: window.location.search }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(current)

  useEffect(() => {
    const onPop = () => setLocation(current())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, options: { replace?: boolean; keepScroll?: boolean } = {}) => {
    const url = new URL(to, window.location.origin)
    if (url.origin !== window.location.origin) {
      window.location.assign(to)
      return
    }
    const target = `${url.pathname}${url.search}${url.hash}`
    const now = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (target !== now) {
      if (options.replace) window.history.replaceState(null, '', target)
      else window.history.pushState({ questly: true }, '', target)
    }
    setLocation(current())
    if (!options.keepScroll) window.scrollTo({ top: 0 })
  }, [])

  const back = useCallback(
    (fallback = '/') => {
      // Only step back through history this app wrote; otherwise go somewhere sensible.
      if (window.history.state?.questly) window.history.back()
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )

  const value = useMemo<RouterValue>(
    () => ({ path: location.path, search: new URLSearchParams(location.search), navigate, back }),
    [location, navigate, back],
  )
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used inside RouterProvider')
  return value
}

/** Matches `/quests/:id` against a path; returns the params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean)
  const b = path.split('/').filter(Boolean)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

/** An in-app link: a real anchor, so it can be opened in a new tab. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter()
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    />
  )
}
