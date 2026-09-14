import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** A labelled control with room for a hint and an error beneath it. */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </label>
      {children({ id, describedBy: hint || error ? hintId : undefined, invalid: Boolean(error) })}
      {(error || hint) && (
        <p id={hintId} className={`mt-1.5 text-xs ${error ? 'text-danger-400' : 'text-slate-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input className={`field ${className}`} {...rest} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea className={`field resize-none ${className}`} {...rest} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props
  return (
    <select className={`field appearance-none bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9 ${className}`} {...rest}>
      {children}
    </select>
  )
}

/** A row of choice chips — for small, fixed option sets. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; hint?: string }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
              active ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-600 bg-ink-900 text-slate-300 hover:border-ink-500'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
