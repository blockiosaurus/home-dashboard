import { Button } from '@dashboard/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'

type ConnectPhase = 'idle' | 'pending' | 'denied' | 'expired'

interface DeviceFlow {
  deviceCode: string
  userCode: string
  verificationUrl: string
  intervalSeconds: number
}

export interface ConnectGoogleProps {
  /** Called once the device flow completes successfully (after the
   * `['accounts']` query has been invalidated and refetched). */
  onConnected: () => void
  /** Optional: render a "Cancel" / dismiss affordance instead of the flow.
   * Omit when there's nothing sensible to cancel back to. */
  onCancel?: () => void
}

/** The Google account device-flow UI: start → show the code + link → poll
 * until Google reports ok/denied/expired. Shared by the wizard's connect
 * step and the Settings accounts panel so both offer the same experience. */
export const ConnectGoogle = ({ onConnected, onCancel }: ConnectGoogleProps) => {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<ConnectPhase>('idle')
  const [flow, setFlow] = useState<DeviceFlow | null>(null)

  const start = useMutation({
    mutationFn: api.oauthStart,
    onSuccess: (res) => {
      setFlow({
        deviceCode: res.deviceCode,
        userCode: res.userCode,
        verificationUrl: res.verificationUrl,
        intervalSeconds: res.intervalSeconds,
      })
      setPhase('pending')
    },
  })

  useEffect(() => {
    if (phase !== 'pending' || !flow) return
    const ms = Math.max(flow.intervalSeconds * 1000, 5000)
    const id = setInterval(async () => {
      const res = await api.oauthPoll(flow.deviceCode)
      if (res.status === 'ok') {
        clearInterval(id)
        // Await the refetch (not just the invalidation) before continuing —
        // callers typically read the same ['accounts'] query right after.
        await queryClient.invalidateQueries({ queryKey: ['accounts'] })
        onConnected()
      } else if (res.status === 'denied' || res.status === 'expired') {
        clearInterval(id)
        setPhase(res.status)
      }
    }, ms)
    return () => clearInterval(id)
  }, [phase, flow, queryClient, onConnected])

  const cancel = () => {
    setFlow(null)
    setPhase('idle')
    onCancel?.()
  }

  if (phase === 'idle') {
    return (
      <div>
        <p className="text-sm text-[var(--text-dim)]">
          We use Google Calendar so the dashboard can show your family's events and let you add new
          ones from the touchscreen.
        </p>
        <Button className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? 'Starting…' : 'Connect Google'}
        </Button>
        {onCancel ? (
          <Button variant="secondary" className="mt-2 w-full" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {start.isError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
          </p>
        ) : null}
      </div>
    )
  }

  if (phase === 'pending' && flow) {
    return (
      <div>
        <div className="mt-2 space-y-2">
          <p>1. On any device, visit:</p>
          <a
            className="block break-all rounded-lg bg-gray-100 p-2 text-sm font-mono"
            href={flow.verificationUrl}
            target="_blank"
            rel="noreferrer"
          >
            {flow.verificationUrl}
          </a>
          <p>2. Enter this code:</p>
          <div className="rounded-lg bg-[var(--accent)] p-4 text-center text-3xl font-bold tracking-widest text-white">
            {flow.userCode}
          </div>
          <p className="text-xs text-[var(--text-dim)]">Waiting for Google…</p>
        </div>
        <Button variant="secondary" className="mt-4 w-full" onClick={cancel}>
          Cancel
        </Button>
      </div>
    )
  }

  // phase === 'denied' | 'expired'
  return (
    <div>
      <p className="text-sm text-red-500">
        {phase === 'denied' ? 'Google sign-in was denied.' : 'That code expired.'}
      </p>
      <Button className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
        {start.isPending ? 'Starting…' : 'Retry'}
      </Button>
    </div>
  )
}
