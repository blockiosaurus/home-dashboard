import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export const Card = ({ className = '', children, ...rest }: CardProps) => (
  <div className={`rounded-2xl bg-white p-5 shadow-[var(--shadow-card)] ${className}`} {...rest}>
    {children}
  </div>
)
