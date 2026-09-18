import { Button } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { WizardCard } from './WizardCard'

const SkipForNow = ({ onSkip }: { onSkip: () => void }) => (
  <button
    type="button"
    onClick={onSkip}
    className="mt-3 w-full py-2 text-center text-sm text-[var(--text-dim)] underline decoration-dotted"
  >
    Skip for now — you can connect a calendar later from Settings
  </button>
)

type ConnectPhase = 'idle' | 'pending' | 'denied' | 'expired'

interface DeviceFlow {
  deviceCode: string
  userCode: string
  verificationUrl: string
  intervalSeconds: number
}

/** The wizard's first step — connect Google Calendar (or skip). This is the
 * only step whose working state (OAuth phase / device flow) is never
 * persisted to sessionStorage: it lives entirely in local component state and
 * disappears on refresh, which is the right behavior for a device code. */
export const ConnectStep = ({ onContinue }: { onContinue: () => void }) => {
  const queryClient = useQueryClient()
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })

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
        // Await the refetch (not just the invalidation) before continuing: the
        // wizard orchestrator reads this same ['accounts'] query to decide
        // whether to show the calendars step, and advancing before the fresh
        // data lands would skip straight past it.
        await queryClient.invalidateQueries({ queryKey: ['accounts'] })
        onContinue()
      } else if (res.status === 'denied' || res.status === 'expired') {
        clearInterval(id)
        setPhase(res.status)
      }
    }, ms)
    return () => clearInterval(id)
  }, [phase, flow, queryClient, onContinue])

  const cancel = () => {
    setFlow(null)
    setPhase('idle')
  }

  if (!system.data || !accounts.data) {
    return (
      <WizardCard title="Connect Google" footer={<SkipForNow onSkip={onContinue} />}>
        <p className="mt-2 text-sm text-[var(--text-dim)]">Loading…</p>
      </WizardCard>
    )
  }

  const connected = accounts.data.accounts.length > 0

  if (connected && phase === 'idle') {
    return (
      <WizardCard
        title="Connect Google"
        footer={
          <>
            <Button className="mt-4 w-full" onClick={onContinue}>
              Continue
            </Button>
            <Button
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              {start.isPending ? 'Starting…' : 'Connect a different account'}
            </Button>
            {start.isError ? (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
              </p>
            ) : null}
            <SkipForNow onSkip={onContinue} />
          </>
        }
      >
        <p className="mt-2 text-sm text-[var(--text-dim)]">Google Calendar is connected.</p>
      </WizardCard>
    )
  }

  if (!system.data.googleConfigured && phase === 'idle') {
    return (
      <WizardCard
        title="Connect Google"
        footer={
          <>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => system.refetch()}
              disabled={system.isFetching}
            >
              {system.isFetching ? 'Checking…' : 'Check again'}
            </Button>
            <SkipForNow onSkip={onContinue} />
          </>
        }
      >
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          We use Google Calendar so the dashboard can show your family's events and let you add new
          ones from the touchscreen.
        </p>
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>This dashboard's server doesn't have Google credentials yet. To add them:</p>
          <code className="mt-2 block rounded-lg bg-white p-2 font-mono text-xs">
            sudo nano /etc/dashboard/env
          </code>
          <code className="mt-2 block rounded-lg bg-white p-2 font-mono text-xs">
            sudo systemctl restart dashboard
          </code>
        </div>
      </WizardCard>
    )
  }

  if (phase === 'idle') {
    return (
      <WizardCard
        title="Connect Google"
        footer={
          <>
            <Button
              className="mt-4 w-full"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              {start.isPending ? 'Starting…' : 'Start'}
            </Button>
            {start.isError ? (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
              </p>
            ) : null}
            <SkipForNow onSkip={onContinue} />
          </>
        }
      >
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          We use Google Calendar so the dashboard can show your family's events and let you add new
          ones from the touchscreen.
        </p>
      </WizardCard>
    )
  }

  if (phase === 'pending' && flow) {
    return (
      <WizardCard
        title="Connect Google"
        footer={
          <>
            <Button variant="secondary" className="mt-4 w-full" onClick={cancel}>
              Cancel
            </Button>
            <SkipForNow onSkip={onContinue} />
          </>
        }
      >
        <div className="mt-4 space-y-2">
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
      </WizardCard>
    )
  }

  // phase === 'denied' | 'expired'
  return (
    <WizardCard
      title="Connect Google"
      footer={
        <>
          <Button className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? 'Starting…' : 'Retry'}
          </Button>
          <SkipForNow onSkip={onContinue} />
        </>
      }
    >
      <p className="mt-4 text-sm text-red-500">
        {phase === 'denied' ? 'Google sign-in was denied.' : 'That code expired.'}
      </p>
    </WizardCard>
  )
}
