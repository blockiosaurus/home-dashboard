import { Card } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { CalendarList } from './CalendarList'

export const CalendarsPanel = () => {
  const { data } = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const calendars = data?.calendars ?? []
  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Calendars
      </h3>
      <div className="mt-3">
        {calendars.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">
            No calendars yet. Connect a Google account to see them here.
          </p>
        ) : (
          <CalendarList calendars={calendars} />
        )}
      </div>
    </Card>
  )
}
