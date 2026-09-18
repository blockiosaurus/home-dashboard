import { Card } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { CalendarList } from './CalendarList'

export const CalendarsPanel = () => {
  const { data } = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })
  const calendars = data?.calendars ?? []
  // An empty list means two very different things: nothing to connect to yet,
  // or a connected account whose calendars the first sync hasn't fetched.
  const connected = (accounts.data?.accounts.length ?? 0) > 0
  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Calendars
      </h3>
      <div className="mt-3">
        {calendars.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">
            {connected
              ? 'Still looking for your calendars…'
              : 'Connect a Google account to see your calendars here.'}
          </p>
        ) : (
          <CalendarList calendars={calendars} />
        )}
      </div>
    </Card>
  )
}
