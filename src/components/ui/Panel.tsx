import type { HTMLAttributes, ReactNode } from 'react'

/** The default surface for grouped content. */
export function Panel({
  raised = false,
  padded = true,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { raised?: boolean; padded?: boolean; children?: ReactNode }) {
  return (
    <div className={`${raised ? 'panel-raised' : 'panel'} ${padded ? 'p-4' : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}

/** Parchment: quest contracts, notices, place descriptions. Dark ink on cream. */
export function Parchment({ className = '', muted = false, children, ...rest }: HTMLAttributes<HTMLDivElement> & { muted?: boolean; children?: ReactNode }) {
  return (
    <div className={`parchment ${muted ? 'parchment-muted' : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}

/** A labelled section with an optional action on the right. */
export function Section({
  title,
  action,
  className = '',
  children,
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
