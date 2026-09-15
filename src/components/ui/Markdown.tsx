import { Fragment, type ReactNode } from 'react'

/**
 * The small slice of Markdown the policy documents use: headings, paragraphs,
 * lists, a summary quote, bold, italics, code and links.
 *
 * Built straight into React elements, never HTML strings, so nothing in a
 * document — whoever edited it — can run as markup. Links go only to pages in
 * the app, to https addresses, or to an email address.
 */

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'rule' }

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length === 3 ? 3 : 2, text: heading[2].trim() })
      i++
      continue
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }
    const bullet = /^\s*[-*]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const marker = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && marker.test(lines[i])) {
        let item = lines[i++].replace(marker, '')
        // A wrapped item continues on indented lines.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) item += ` ${lines[i++].trim()}`
        items.push(item)
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) paragraph.push(lines[i++].trim())
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi

function safeHref(href: string): { href: string; internal: boolean } | null {
  if (/^\/(?!\/)[\w\-/#?=&.%]*$/.test(href)) return { href, internal: true }
  if (/^https:\/\/[^\s]+$/i.test(href)) return { href, internal: false }
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return { href, internal: false }
  return null
}

function inline(text: string, onNavigate: ((path: string) => void) | undefined, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const k = `${key}-${n++}`
    const [whole, bold, code, linkText, linkHref, italic, email] = match
    if (bold !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-slate-100">
          {inline(bold, onNavigate, k)}
        </strong>,
      )
    } else if (code !== undefined) {
      out.push(
        <code key={k} className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[0.85em] text-slate-200">
          {code}
        </code>,
      )
    } else if (linkText !== undefined && linkHref !== undefined) {
      const safe = safeHref(linkHref)
      if (!safe) out.push(linkText)
      else
        out.push(
          <a
            key={k}
            href={safe.href}
            className="font-medium text-gold-300 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-200"
            {...(safe.internal
              ? {
                  onClick: (e: React.MouseEvent) => {
                    if (!onNavigate || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    onNavigate(safe.href)
                  },
                }
              : safe.href.startsWith('mailto:')
                ? {}
                : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {inline(linkText, onNavigate, k)}
          </a>,
        )
    } else if (italic !== undefined) {
      out.push(
        <em key={k} className="italic">
          {inline(italic, onNavigate, k)}
        </em>,
      )
    } else if (email !== undefined) {
      out.push(
        <a key={k} href={`mailto:${email}`} className="font-medium text-gold-300 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-200">
          {email}
        </a>,
      )
    } else {
      out.push(whole)
    }
    last = start + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export default function Markdown({ source, onNavigate, className = '' }: { source: string; onNavigate?: (path: string) => void; className?: string }) {
  const blocks = parse(source)
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const k = `b${i}`
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={k} id={headingId(block.text)} className="mt-8 scroll-mt-24 font-display text-lg font-bold leading-snug text-slate-50 first:mt-0">
                {inline(block.text, onNavigate, k)}
              </h2>
            ) : (
              <h3 key={k} id={headingId(block.text)} className="mt-5 scroll-mt-24 text-sm font-semibold text-slate-100">
                {inline(block.text, onNavigate, k)}
              </h3>
            )
          case 'quote':
            return (
              <blockquote key={k} className="mt-4 rounded-xl border border-gold-500/35 bg-gold-500/5 px-4 py-3 text-sm leading-relaxed text-slate-200 first:mt-0">
                {inline(block.text, onNavigate, k)}
              </blockquote>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List
                key={k}
                className={`mt-3 space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-gold-500`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, onNavigate, `${k}-${j}`)}</li>
                ))}
              </List>
            )
          }
          case 'rule':
            return <hr key={k} className="my-6 border-ink-700" />
          default:
            return (
              <Fragment key={k}>
                <p className="mt-3 text-sm leading-relaxed text-slate-300 first:mt-0">{inline(block.text, onNavigate, k)}</p>
              </Fragment>
            )
        }
      })}
    </div>
  )
}
