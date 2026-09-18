import type { Scene } from '@dashboard/core'
import { OnScreenKeyboard } from '@dashboard/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { SceneRenderer } from './SceneRenderer'
import { SetupScreen } from './SetupScreen'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

const qc = new QueryClient()

// How long the socket has to be down before we bother the viewer with a
// banner — a normal reconnect (server restart, brief network blip) finishes
// well inside this window and shouldn't cause a flash of UI.
const RECONNECT_BANNER_DELAY_MS = 5000

interface SystemState {
  firstRunComplete: boolean
  adminUrls: string[]
}

const ReconnectingBanner = () => (
  <div className="fixed inset-x-0 top-0 z-50 bg-amber-100 py-1 text-center text-sm text-amber-800">
    Reconnecting to the dashboard server…
  </div>
)

const Inner = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)
  const setActiveSceneId = useDashboardStore((s) => s.setActiveSceneId)
  const activeSceneId = useDashboardStore((s) => s.activeSceneId)
  const wsConnected = useDashboardStore((s) => s.wsConnected)
  const setWsConnected = useDashboardStore((s) => s.setWsConnected)
  const [showReconnecting, setShowReconnecting] = useState(false)

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

  // Tracks whether the socket has dropped at least once since it last came
  // up, so a reconnect only invalidates queries (and not the very first
  // connection, whose data is already fresh from the initial fetch).
  const wasDisconnected = useRef(false)

  useEffect(
    () =>
      connectWs(
        (m) => {
          if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
          if (m.type === 'calendar:changed') bumpCalendar()
          if (m.type === 'scene:updated') qc.invalidateQueries({ queryKey: ['scenes'] })
          if (m.type === 'scene:active') setActiveSceneId(m.sceneId)
          if (m.type === 'system:updated') qc.invalidateQueries({ queryKey: ['system'] })
        },
        (connected) => {
          setWsConnected(connected)
          if (!connected) {
            wasDisconnected.current = true
            return
          }
          if (wasDisconnected.current) {
            wasDisconnected.current = false
            qc.invalidateQueries({ queryKey: ['scenes'] })
            qc.invalidateQueries({ queryKey: ['system'] })
          }
        },
      ),
    [setWidgetData, bumpCalendar, setActiveSceneId, setWsConnected],
  )

  useEffect(() => {
    if (wsConnected) {
      setShowReconnecting(false)
      return
    }
    const t = setTimeout(() => setShowReconnecting(true), RECONNECT_BANNER_DELAY_MS)
    return () => clearTimeout(t)
  }, [wsConnected])

  const banner = showReconnecting ? <ReconnectingBanner /> : null

  // Neutral loading state — distinct from "no scenes yet" below, which only
  // applies once the scenes query has actually resolved to an empty list.
  if (!scenes || !system) {
    return (
      <>
        {banner}
        <p className="flex h-full items-center justify-center p-4 text-[var(--text-dim)]">
          Starting…
        </p>
      </>
    )
  }

  if (!system.firstRunComplete) {
    return (
      <>
        {banner}
        <SetupScreen adminUrls={system.adminUrls} />
      </>
    )
  }

  const selected =
    scenes.find((s) => s.id === activeSceneId) ?? scenes.find((s) => s.isDefault) ?? scenes[0]
  if (!selected) {
    return (
      <>
        {banner}
        <p className="p-4">No scenes yet.</p>
      </>
    )
  }
  return (
    <>
      {banner}
      <SceneRenderer scene={selected} />
    </>
  )
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Inner />
    <OnScreenKeyboard />
  </QueryClientProvider>
)
