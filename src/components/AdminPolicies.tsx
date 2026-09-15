import { useEffect, useState } from 'react'
import { Eye, Loader2, PencilLine, RotateCcw } from 'lucide-react'
import { adminPolicies, adminResetPolicy, adminSavePolicy, type AdminPolicy, type PolicySlug } from '../lib/api'
import Markdown from './ui/Markdown'

/**
 * The policy documents, their history, and — for the superadmin — editing.
 * Every save is a new version; a significant change to the Terms or Privacy
 * Policy can ask everyone to accept it again.
 */
export default function AdminPolicies() {
  const [data, setData] = useState<{ policies: AdminPolicy[]; variables: Record<string, string | number | boolean>; canEdit: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState<PolicySlug>('terms')

  useEffect(() => {
    adminPolicies()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the documents.'))
  }, [])

  if (error) return <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>
  if (!data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }
  const doc = data.policies.find((p) => p.slug === slug) ?? data.policies[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {data.policies.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => setSlug(p.slug)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${p.slug === doc.slug ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {p.title}
          </button>
        ))}
      </div>
      <PolicyEditor
        key={`${doc.slug}-${doc.version}`}
        doc={doc}
        canEdit={data.canEdit}
        variables={data.variables}
        onSaved={(policies) => setData({ ...data, policies })}
      />
    </div>
  )
}

function PolicyEditor({
  doc,
  canEdit,
  variables,
  onSaved,
}: {
  doc: AdminPolicy
  canEdit: boolean
  variables: Record<string, string | number | boolean>
  onSaved: (policies: AdminPolicy[]) => void
}) {
  const [title, setTitle] = useState(doc.title)
  const [body, setBody] = useState(doc.body)
  const [note, setNote] = useState('')
  const [material, setMaterial] = useState(false)
  const [preview, setPreview] = useState(!canEdit)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const dirty = title !== doc.title || body !== doc.body

  async function run(fn: () => Promise<{ policies: AdminPolicy[] }>) {
    setBusy(true)
    setProblem(null)
    try {
      onSaved((await fn()).policies)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-ink-600 bg-ink-850/60 px-3 py-2.5 text-[11px] text-slate-400">
        Version {doc.version}
        {doc.updatedAt ? ` · ${new Date(doc.updatedAt).toLocaleString()}` : ''} · {doc.fromFile ? 'default text from the repository' : 'edited in the console'}
        {doc.acceptance && doc.requiredVersion !== null && (
          <> · {(doc.acceptedCurrent ?? 0).toLocaleString()} {doc.acceptedCurrent === 1 ? 'account has' : 'accounts have'} accepted version {doc.requiredVersion} or later</>
        )}
        {!canEdit && <p className="mt-1 text-slate-500">Only the superadmin can edit documents.</p>}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${!preview ? 'border-gold-500/50 text-gold-300' : 'border-ink-600 text-slate-400 hover:text-slate-200'}`}
          >
            <PencilLine className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${preview ? 'border-gold-500/50 text-gold-300' : 'border-ink-600 text-slate-400 hover:text-slate-200'}`}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          {!doc.fromFile && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm('Replace this document with the default text from the repository? The current version stays in the history.')) void run(() => adminResetPolicy(doc.slug))
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
          )}
        </div>
      )}

      {preview ? (
        <div className="rounded-xl border border-ink-600 bg-ink-900/70 px-4 py-4">
          <p className="mb-3 text-[11px] text-slate-500">Placeholders such as {'{{contactEmail}}'} are filled in when players open the page.</p>
          <Markdown source={body} />
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            aria-label="Title"
            className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold-500/60"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Document text (Markdown)"
            rows={24}
            spellCheck
            className="w-full resize-y rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-gold-500/60"
          />
          <details className="rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2 text-[11px] text-slate-400">
            <summary className="cursor-pointer text-slate-300">Placeholders and their values</summary>
            <p className="mt-1.5">
              <code>{'{{name}}'}</code> inserts a value. <code>{'{{#name}}…{{/name}}'}</code> shows text only when it is set, <code>{'{{^name}}…{{/name}}'}</code> only when it is not.
              Values come from the server's environment.
            </p>
            <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {Object.entries(variables).map(([key, value]) => (
                <li key={key} className="truncate">
                  <code>{key}</code>: <span className="text-slate-300">{value === '' ? '(not set)' : String(value)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {canEdit && (
        <div className="space-y-2 rounded-xl border border-ink-600 bg-ink-850/60 p-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="What changed (kept in the history)"
            className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
          />
          {doc.acceptance && (
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={material} onChange={(e) => setMaterial(e.target.checked)} className="mt-0.5 h-4 w-4 accent-gold-500" />
              <span>Significant change: ask every player to accept this version. Leave unticked for corrections and clarifications.</span>
            </label>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || (!dirty && !material)}
              onClick={() => void run(() => adminSavePolicy(doc.slug, { title, body, material, note: note.trim() || undefined }))}
              className="rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-1.5 text-xs font-semibold text-onAccent disabled:opacity-40"
            >
              Publish version {doc.version + 1}
            </button>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-gold-400" />}
            {problem && <p className="text-xs text-danger-400">{problem}</p>}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">History</p>
        <ul className="space-y-1">
          {doc.history.map((h) => (
            <li key={h.version} className="flex flex-wrap gap-x-2 rounded-lg border border-ink-700 bg-ink-900/50 px-2.5 py-1.5 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-200">v{h.version}</span>
              <span>{new Date(h.createdAt).toLocaleString()}</span>
              <span>{h.by ?? (h.fromFile ? 'repository' : 'unknown')}</span>
              {h.material && <span className="text-gold-300">asked players to accept</span>}
              {h.note && <span className="text-slate-500">— {h.note}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
