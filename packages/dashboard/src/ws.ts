import { ServerMessageSchema, type ServerMessage } from '@dashboard/core'

export const connectWs = (onMessage: (m: ServerMessage) => void): (() => void) => {
  let ws: WebSocket | null = null
  let stopped = false
  const open = () => {
    if (stopped) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    ws.onmessage = (e) => {
      try {
        const m = ServerMessageSchema.parse(JSON.parse(String(e.data)))
        onMessage(m)
      } catch {
        // ignore malformed
      }
    }
    ws.onclose = () => {
      if (!stopped) setTimeout(open, 1000)
    }
  }
  open()
  return () => {
    stopped = true
    ws?.close()
  }
}
