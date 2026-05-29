import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
}

const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  secondary: 'bg-white border border-[var(--text-dim)]/30 text-[var(--text)] hover:bg-gray-50',
  ghost: 'text-[var(--accent)] hover:bg-[var(--accent)]/10',
  danger: 'bg-red-500 text-white hover:bg-red-600',
}

export const Button = ({ variant = 'primary', className = '', children, ...rest }: ButtonProps) => (
  <button
    type="button"
    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
    {...rest}
  >
    {children}
  </button>
)
