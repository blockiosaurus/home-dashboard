import { useQuery } from '@tanstack/react-query'
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns'
import type { CachedEvent } from './types'

export interface CalendarConfig {
  view?: 'week' | 'month' | 'day'
}

const fetchEvents = async (from: number, to: number): Promise<CachedEvent[]> => {
  const res = await fetch(`/api/events?from=${from}&to=${to}`)
  if (!res.ok) throw new Error('events fetch failed')
  return ((await res.json()) as { events: CachedEvent[] }).events
}

export const CalendarView = ({ config }: { config: CalendarConfig; data: undefined }) => {
  const today = new Date()
  const start = startOfWeek(today, { weekStartsOn: 0 })
  const end = endOfWeek(today, { weekStartsOn: 0 })

  const { data: events = [] } = useQuery({
    queryKey: ['calendar', config.view ?? 'week', start.getTime(), end.getTime()],
    queryFn: () => fetchEvents(start.getTime(), end.getTime()),
    refetchInterval: 60_000,
  })

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <div className="flex h-full flex-col p-4">
      <div className="grid grid-cols-7 gap-2 pb-2 text-xs font-semibold text-[var(--text-dim)]">
        {days.map((d) => (
          <div key={d.toISOString()} className="text-center">
            {format(d, 'EEE')}<br />
            <span
              className={isSameDay(d, today) ? 'text-white bg-[var(--accent)] rounded-md px-2' : ''}
            >
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 gap-2 overflow-y-auto">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex flex-col gap-1">
            {events
              .filter((e) => isSameDay(new Date(e.start), d))
              .map((e) => (
                <div
                  key={e.id}
                  className="rounded-md px-2 py-1 text-xs text-white"
                  style={{ background: e.color ?? 'var(--accent)' }}
                >
                  {format(new Date(e.start), 'h:mma')} {e.title}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
