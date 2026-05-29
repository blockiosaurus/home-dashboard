import type { Scene } from '@dashboard/core'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SceneRenderer } from './SceneRenderer'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

const qc = new QueryClient()

const Inner = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)
  const { data } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await fetch('/api/scenes')
      const json = (await res.json()) as { scenes: Scene[] }
      return json.scenes.find((s) => s.isDefault) ?? json.scenes[0] ?? null
    },
  })

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
        if (m.type === 'scene:updated') qc.invalidateQueries({ queryKey: ['scenes'] })
      }),
    [setWidgetData, bumpCalendar],
  )

  if (!data) return <p className="p-4">No scene configured yet.</p>
  return <SceneRenderer scene={data} />
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Inner />
  </QueryClientProvider>
)
