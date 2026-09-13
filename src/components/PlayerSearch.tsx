import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { searchPlayers, type FoundPlayer } from '../lib/api'
import { PlayerAvatar } from './ChallengeParts'

/**
 * Finding someone: a search box over a scrolling list of players.
 *
 * Before anything is typed it lists the most recently active players, so there
 * is always someone to scroll through rather than an empty box. Typing matches
 * any part of a username or name. When nobody turns up it says why someone
 * might be missing — people only appear once their profile is finished, and
 * only within your own age group — instead of just "no results".
 */
export default function PlayerSearch({
  onPick,
  placeholder = 'Search players by name or @username',
  autoFocus = false,
  maxHeight = '20rem',
}: {
  onPick: (player: FoundPlayer) => void
  placeholder?: string
  autoFocus?: boolean
  maxHeight?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundPlayer[] | null>(null)
  const [searching, setSearching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search a beat after typing stops, and ignore any answer that is no longer
  // for the latest question.
  const latest = useRef<string | null>(null)
  useEffect(() => {
    const q = query.trim().replace(/^@+/, '')
    latest.current = q
    setSearching(true)
    const t = setTimeout(
      () => {
        searchPlayers(q)
          .then((r) => {
            if (latest.current !== q) return
            setResults(r.results)
            setError(null)
          })
          .catch((err) => {
            if (latest.current !== q) return
            setResults([])
            setError(err instanceof Error ? err.message : 'Search is not working right now.')
          })
          .finally(() => latest.current === q && setSearching(false))
      },
      q ? 250 : 0,
    )
    return () => clearTimeout(t)
  }, [query])

  const typed = query.trim().replace(/^@+/, '')
  const others = (results ?? []).filter((p) => !p.you)

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          placeholder={placeholder}
          aria-label="Search players"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="w-full rounded-xl border border-ink-600 bg-ink-800 py-2.5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
        ) : (
          query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      <p className="mt-2.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {typed ? `Results for "${typed}"` : 'Recently active'}
      </p>

      <ul className="mt-1 space-y-1 overflow-y-auto overscroll-contain pr-1" style={{ maxHeight }}>
        {results?.map((p) => (
          <li key={p.username}>
            {p.you ? (
              <div className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 opacity-70">
                <PlayerAvatar player={p} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{p.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">@{p.username}</span>
                </span>
                <span className="rounded-full border border-ink-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  You
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink-800"
              >
                <PlayerAvatar player={p} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{p.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    @{p.username} · {p.rank} · Level {p.level}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {results && !searching && others.length === 0 && (
        <div className="mt-1 rounded-xl border border-dashed border-ink-600 px-3 py-3 text-xs leading-relaxed text-slate-400">
          {error ? (
            error
          ) : typed ? (
            <>
              Nobody else matches "{typed}". People show up here once they have finished their profile, and only if they are in your age
              group: under 18 and 18+ are kept apart.
            </>
          ) : (
            <>No other players in your age group yet. When friends join Questly and finish their profile, they will show up here.</>
          )}
        </div>
      )}
    </div>
  )
}
