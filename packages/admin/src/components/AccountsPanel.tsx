import { Button, Card } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'

interface Account {
  id: string
  email: string
  provider: string
  created_at: number
}

export const AccountsPanel = () => {
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('accounts fetch failed')
      return res.json() as Promise<{ accounts: Account[] }>
    },
  })
  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Accounts
      </h3>
      <div className="mt-3 space-y-2">
        {(data?.accounts ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No Google account connected.</p>
        ) : (
          (data?.accounts ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--text-dim)]/20 p-3">
              <span className="text-sm font-semibold">{a.email || a.provider}</span>
              <Button variant="secondary" disabled>
                Disconnect
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
