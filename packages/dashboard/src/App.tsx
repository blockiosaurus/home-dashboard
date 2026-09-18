import type { Scene } from '@dashboard/core'
import { OnScreenKeyboard } from '@dashboard/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SceneRenderer } from './SceneRenderer'
import { SetupScreen } from './SetupScreen'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

const qc = new QueryClient()

interface SystemState {
  firstRunComplete: boolean
  adminUrls: string[]
}

const Inner = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)
  const setActiveSceneId = useDashboardStore((s) => s.setActiveSceneId)
  const activeSceneId = useDashboardStore((s) => s.activeSceneId)

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await fetch('/api/scenes')
      const json = (await res.json()) as { scenes: Scene[] }
      return json.scenes
    },
  })

  const { data: system } = useQuery({
    queryKey: ['system'],
    queryFn: async () => {
      const res = await fetch('/api/system')
      return (await res.json()) as SystemState
    },
  })

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
        if (m.type === 'scene:updated') qc.invalidateQueries({ queryKey: ['scenes'] })
        if (m.type === 'scene:active') setActiveSceneId(m.sceneId)
        if (m.type === 'system:updated') qc.invalidateQueries({ queryKey: ['system'] })
      }),
    [setWidgetData, bumpCalendar, setActiveSceneId],
  )

  // Neutral loading state — distinct from "no scenes yet" below, which only
  // applies once the scenes query has actually resolved to an empty list.
  if (!scenes || !system) {
    return (
      <p className="flex h-full items-center justify-center p-4 text-[var(--text-dim)]">
        Starting…
      </p>
    )
  }

  if (!system.firstRunComplete) return <SetupScreen adminUrls={system.adminUrls} />

  const selected =
    scenes.find((s) => s.id === activeSceneId) ?? scenes.find((s) => s.isDefault) ?? scenes[0]
  if (!selected) return <p className="p-4">No scenes yet.</p>
  return <SceneRenderer scene={selected} />
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Inner />
    <OnScreenKeyboard />
  </QueryClientProvider>
)
