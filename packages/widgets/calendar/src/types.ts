export interface CachedEvent {
  id: string
  calendarId: string
  start: number
  end: number
  allDay: boolean
  title: string
  color: string | null
  location: string | null
}

export interface CalendarData {
  events: CachedEvent[]
}
