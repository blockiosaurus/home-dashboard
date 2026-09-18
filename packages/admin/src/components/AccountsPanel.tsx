import { Button, Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { ConnectGoogle } from '../components/ConnectGoogle'
import { relativeTime } from '../relative-time'

export const AccountsPanel = () => {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  })
  const status = useQuery({
    queryKey: ['sync-status'],
    queryFn: api.getSyncStatus,
    refetchInterval: 30_000,
  })
  const disconnect = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
  const [connecting, setConnecting] = useState(false)

  const accounts = data?.accounts ?? []

  const handleConnected = () => {
    setConnecting(false)
    // A freshly connected account brings its own calendars and (once the
    // next sync tick runs) a fresh sync status — refresh everything this
    // panel and its neighbors show, not just the accounts list itself.
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['calendars'] })
    qc.invalidateQueries({ queryKey: ['sync-status'] })
  }

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Accounts
      </h3>
      <div className="mt-3 space-y-2">
        {accounts.length === 0 && !connecting ? (
          <p className="text-sm text-[var(--text-dim)]">No Google account connected.</p>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-[var(--text-dim)]/20 p-3"
            >
              <span className="text-sm font-semibold">
                Connected as {a.email || 'Google account'}
              </span>
              <Button
                variant="secondary"
                onClick={() => disconnect.mutate(a.id)}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          ))
        )}
        {accounts.length === 0 &&
          (connecting ? (
            <ConnectGoogle onConnected={handleConnected} onCancel={() => setConnecting(false)} />
          ) : (
            <Button className="w-full" onClick={() => setConnecting(true)}>
              Connect Google
            </Button>
          ))}
      </div>
      {accounts.length > 0 ? (
        <div className="mt-3 border-t border-[var(--text-dim)]/20 pt-3 text-sm text-[var(--text-dim)]">
          {status.data ? (
            status.data.lastSyncAt === null ? (
              <span>Not synced yet</span>
            ) : (
              <span>
                Last synced {relativeTime(status.data.lastSyncAt)} · {status.data.eventCount}{' '}
                {status.data.eventCount === 1 ? 'event' : 'events'}
              </span>
            )
          ) : null}
          {status.data?.lastError ? (
            <p className="mt-1 text-red-600">{status.data.lastError}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
