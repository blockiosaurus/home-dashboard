import { applyEventsDiff, type CachedEvent } from './calendar-sync'
import type { GoogleEvent, ListEventsArgs, ListEventsResult } from './google-client'

type ListFn = (token: string, calendarId: string, args: ListEventsArgs) => Promise<ListEventsResult>

export interface SyncArgs {
  calendarId: string
  accessToken: string
  currentSyncToken: string | null
  timeWindowDays: number
  list: ListFn
  persist: (calendarId: string, events: CachedEvent[], syncedAt: number) => void
  setToken: (calendarId: string, token: string | null) => void
  now: () => number
}

export interface SyncOk {
  kind: 'ok' | 'full-resync'
  upserts: number
  deletes: number
}

const collect = async (
  list: ListFn,
  token: string,
  calendarId: string,
  initialArgs: ListEventsArgs,
): Promise<{ events: GoogleEvent[]; nextSyncToken?: string; invalid?: boolean }> => {
  const collected: GoogleEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  for (;;) {
    const callArgs: ListEventsArgs = pageToken
      ? { ...initialArgs, pageToken }
      : { ...initialArgs }
    const res = await list(token, calendarId, callArgs)
    if (res.syncTokenInvalid) return { events: [], invalid: true }
    collected.push(...res.events)
    if (res.nextSyncToken) nextSyncToken = res.nextSyncToken
    if (!res.nextPageToken) break
    pageToken = res.nextPageToken
  }
  const out: { events: GoogleEvent[]; nextSyncToken?: string } = { events: collected }
  if (nextSyncToken) out.nextSyncToken = nextSyncToken
  return out
}

export const syncCalendarOnce = async (args: SyncArgs): Promise<SyncOk> => {
  let kind: SyncOk['kind'] = 'ok'
  let result = await collect(
    args.list,
    args.accessToken,
    args.calendarId,
    args.currentSyncToken ? { syncToken: args.currentSyncToken } : timeWindowArgs(args),
  )

  if (result.invalid) {
    kind = 'full-resync'
    result = await collect(args.list, args.accessToken, args.calendarId, timeWindowArgs(args))
  }

  const cache = new Map<string, CachedEvent>()
  const diff = applyEventsDiff(cache, args.calendarId, result.events, args.now())
  args.persist(args.calendarId, [...cache.values()], args.now())
  if (result.nextSyncToken) args.setToken(args.calendarId, result.nextSyncToken)
  return { kind, upserts: diff.upserts, deletes: diff.deletes }
}

const timeWindowArgs = (args: SyncArgs): ListEventsArgs => {
  const day = 86_400_000
  return {
    timeMin: new Date(args.now() - args.timeWindowDays * day).toISOString(),
    timeMax: new Date(args.now() + args.timeWindowDays * day).toISOString(),
  }
}
