import { useQuery } from '@tanstack/react-query'
import { addDays, endOfDay, format, isSameDay, startOfDay } from 'date-fns'

interface ApiEvent {
  id: string
  start: number
  end: number
  allDay: boolean
  title: string
  color: string | null
}

export interface AgendaConfig {
  daysAhead?: number
  title?: string
}

export const AgendaView = ({ config }: { config: AgendaConfig; data: undefined }) => {
  const now = new Date()
  const days = config.daysAhead ?? 1
  const from = startOfDay(now).getTime()
  const to = endOfDay(addDays(now, days)).getTime()

  const { data: events = [] } = useQuery({
    queryKey: ['agenda', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/events?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('events fetch failed')
      return ((await res.json()) as { events: ApiEvent[] }).events
    },
    refetchInterval: 60_000,
  })

  const grouped = events.reduce<Map<string, ApiEvent[]>>((acc, ev) => {
    const key = format(new Date(ev.start), 'yyyy-MM-dd')
    const list = acc.get(key) ?? []
    list.push(ev)
    acc.set(key, list)
    return acc
  }, new Map())

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Up next'}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {[...grouped.entries()].map(([day, list]) => {
          const date = new Date(`${day}T00:00:00`)
          const heading = isSameDay(date, now)
            ? 'Today'
            : isSameDay(date, addDays(now, 1))
              ? 'Tomorrow'
              : format(date, 'EEE MMM d')
          return (
            <div key={day}>
              <div className="text-[10px] font-semibold uppercase text-[var(--text-dim)]">
                {heading}
              </div>
              {list.map((ev) => (
                <div
                  key={ev.id}
                  className="mt-1 rounded-md px-2 py-1 text-xs text-white"
                  style={{ background: ev.color ?? 'var(--accent)' }}
                >
                  {ev.allDay ? 'All day' : format(new Date(ev.start), 'h:mma')} · {ev.title}
                </div>
              ))}
            </div>
          )
        })}
        {events.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">Nothing scheduled.</div>
        ) : null}
      </div>
    </div>
  )
}
