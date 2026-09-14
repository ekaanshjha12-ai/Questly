import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

export type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'ink'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  gold: 'btn-gold',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  ink: 'btn-ink',
}

/**
 * The one button. Variants carry meaning, not decoration: primary moves the
 * player forward, gold claims a reward, danger ends something, ink sits on
 * parchment. A button that is working shows it and cannot be pressed twice.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  trailingIcon: Trailing,
  block = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  loading?: boolean
  icon?: LucideIcon
  trailingIcon?: LucideIcon
  block?: boolean
  children?: ReactNode
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${VARIANT[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
      {Trailing && !loading ? <Trailing className="h-4 w-4" aria-hidden /> : null}
    </button>
  )
}
