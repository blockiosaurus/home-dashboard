import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Input = ({ label, className = '', id, ...rest }: InputProps) => {
  const inputId = id ?? rest.name
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label ? <span className="font-semibold text-[var(--text-dim)]">{label}</span> : null}
      <input
        id={inputId}
        className={`rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] ${className}`}
        {...rest}
      />
    </label>
  )
}
