import { useEffect } from 'react'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

export const App = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
      }),
    [setWidgetData, bumpCalendar],
  )

  return (
    <main className="h-full p-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        Connected
      </p>
    </main>
  )
}
