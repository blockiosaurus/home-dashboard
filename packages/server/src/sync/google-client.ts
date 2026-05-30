import { fetch } from 'undici'
import type { Response } from 'undici'

const API = 'https://www.googleapis.com/calendar/v3'

const failWithBody = async (label: string, res: Response): Promise<never> => {
  // Google returns JSON like { "error": { "code": 403, "message": "...", "status": "..." } }
  // Surface the message so callers see something actionable, not just the status code.
  const body = await res.text().catch(() => '')
  let detail = body
  try {
    const j = JSON.parse(body) as { error?: { message?: string } }
    if (j.error?.message) detail = j.error.message
  } catch {
    // not JSON; fall through with raw body
  }
  throw new Error(`${label} failed: ${res.status} ${detail}`.trim())
}

export interface CalendarSummary {
  id: string
  summary: string
}

export const listCalendars = async (accessToken: string): Promise<CalendarSummary[]> => {
  const res = await fetch(`${API}/users/me/calendarList?fields=items(id,summary)`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) await failWithBody('listCalendars', res)
  const j = (await res.json()) as { items?: CalendarSummary[] }
  return j.items ?? []
}

export interface GoogleEvent {
  id: string
  etag: string
  status?: string
  summary?: string
  location?: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
}

export interface ListEventsResult {
  events: GoogleEvent[]
  nextSyncToken?: string
  nextPageToken?: string
  syncTokenInvalid?: boolean
}

export interface ListEventsArgs {
  syncToken?: string
  timeMin?: string
  timeMax?: string
  pageToken?: string
}

export const listEvents = async (
  accessToken: string,
  calendarId: string,
  args: ListEventsArgs,
): Promise<ListEventsResult> => {
  const params = new URLSearchParams({
    singleEvents: 'true',
    maxResults: '250',
    showDeleted: 'true',
  })
  if (args.syncToken) params.set('syncToken', args.syncToken)
  if (args.pageToken) params.set('pageToken', args.pageToken)
  if (!args.syncToken && args.timeMin) params.set('timeMin', args.timeMin)
  if (!args.syncToken && args.timeMax) params.set('timeMax', args.timeMax)

  const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  if (res.status === 410) return { events: [], syncTokenInvalid: true }
  if (!res.ok) await failWithBody('listEvents', res)
  const j = (await res.json()) as {
    items?: GoogleEvent[]
    nextSyncToken?: string
    nextPageToken?: string
  }
  const result: ListEventsResult = { events: j.items ?? [] }
  if (j.nextSyncToken) result.nextSyncToken = j.nextSyncToken
  if (j.nextPageToken) result.nextPageToken = j.nextPageToken
  return result
}

export interface EventWrite {
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
}

export const insertEvent = async (
  accessToken: string,
  calendarId: string,
  body: EventWrite,
): Promise<GoogleEvent> => {
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await failWithBody('insertEvent', res)
  return (await res.json()) as GoogleEvent
}

export const updateEvent = async (
  accessToken: string,
  calendarId: string,
  eventId: string,
  etag: string,
  body: EventWrite,
): Promise<GoogleEvent | 'conflict'> => {
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(body),
    },
  )
  if (res.status === 412 || res.status === 409) return 'conflict'
  if (!res.ok) await failWithBody('updateEvent', res)
  return (await res.json()) as GoogleEvent
}

export const deleteEvent = async (
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> => {
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    },
  )
  if (res.status !== 204 && res.status !== 410) {
    await failWithBody('deleteEvent', res)
  }
}
