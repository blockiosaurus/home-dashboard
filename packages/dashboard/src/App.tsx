import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { Scene } from '@dashboard/core'
import { useEffect } from 'react'
import { SceneRenderer } from './SceneRenderer'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

const qc = new QueryClient()

const Inner = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)
  const setActiveSceneId = useDashboardStore((s) => s.setActiveSceneId)
  const activeSceneId = useDashboardStore((s) => s.activeSceneId)

  const { data } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await fetch('/api/scenes')
      const json = (await res.json()) as { scenes: Scene[] }
      return json.scenes
    },
  })

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
        if (m.type === 'scene:updated') qc.invalidateQueries({ queryKey: ['scenes'] })
        if (m.type === 'scene:active') setActiveSceneId(m.sceneId)
      }),
    [setWidgetData, bumpCalendar, setActiveSceneId],
  )

  if (!data) return <p className="p-4">No scenes yet.</p>
  const selected =
    data.find((s) => s.id === activeSceneId) ??
    data.find((s) => s.isDefault) ??
    data[0]
  if (!selected) return <p className="p-4">No scenes yet.</p>
  return <SceneRenderer scene={selected} />
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Inner />
  </QueryClientProvider>
)
