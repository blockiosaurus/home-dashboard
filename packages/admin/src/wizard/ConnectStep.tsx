import { Button } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { ConnectGoogle } from '../components/ConnectGoogle'
import { SkipForNow, WizardCard } from './WizardCard'

/** The wizard's first step — connect Google Calendar (or skip). The device
 * flow itself (start → code → poll) lives in `ConnectGoogle`, shared with the
 * Settings accounts panel; this component only owns the surrounding states —
 * already connected, credentials not configured, and the skip path — none of
 * which are persisted to sessionStorage, so a refresh mid-connect starts
 * over, which is the right behavior for a device code. */
export const ConnectStep = ({ onContinue }: { onContinue: () => void }) => {
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })
  const [connecting, setConnecting] = useState(false)

  if (!system.data || !accounts.data) {
    return (
      <WizardCard title="Connect Google" footer={<SkipForNow onSkip={onContinue} />}>
        <p className="mt-2 text-sm text-[var(--text-dim)]">Loading…</p>
      </WizardCard>
    )
  }

  const connected = accounts.data.accounts.length > 0

  if (connected && !connecting) {
    return (
      <WizardCard
        title="Connect Google"
        footer={
          <>
            <Button className="mt-4 w-full" onClick={onContinue}>
              Continue
            </Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setConnecting(true)}>
              Connect a different account
            </Button>
            <SkipForNow onSkip={onContinue} />
          </>
        }
      >
        <p className="mt-2 text-sm text-[var(--text-dim)]">Google Calendar is connected.</p>
      </WizardCard>
    )
  }

  if (!connected && !system.data.googleConfigured) {
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

  return (
    <WizardCard title="Connect Google" footer={<SkipForNow onSkip={onContinue} />}>
      <ConnectGoogle
        onConnected={onContinue}
        {...(connected ? { onCancel: () => setConnecting(false) } : {})}
      />
    </WizardCard>
  )
}
