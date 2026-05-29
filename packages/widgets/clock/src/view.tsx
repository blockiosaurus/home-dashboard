import { useEffect, useState } from 'react'

export interface ClockConfig {
  format?: '12h' | '24h'
}

export const ClockView = ({ config }: { config: ClockConfig; data: undefined }) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hour = now.getHours()
  const minute = now.getMinutes().toString().padStart(2, '0')
  const display =
    config.format === '24h'
      ? `${hour.toString().padStart(2, '0')}:${minute}`
      : `${((hour + 11) % 12) + 1}:${minute}${hour < 12 ? ' AM' : ' PM'}`
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex h-full items-center justify-between px-6">
      <span className="text-3xl font-bold tracking-tight">{dateLabel}</span>
      <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
        {display}
      </span>
    </div>
  )
}
