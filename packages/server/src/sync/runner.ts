import { type CachedEvent, applyEventsDiff, cacheKey } from './calendar-sync'
import type { GoogleEvent, ListEventsArgs, ListEventsResult } from './google-client'

type ListFn = (token: string, calendarId: string, args: ListEventsArgs) => Promise<ListEventsResult>

export interface SyncWindow {
  from: number
  to: number
}

export interface SyncArgs {
  calendarId: string
  accessToken: string
  currentSyncToken: string | null
  /** When the last time-window (non-token) sync of this calendar finished. */
  lastFullSyncAt: number | null
  /** A sync token only reports changes, so events that already existed past
   * the first sync's window would never arrive. Re-listing the window this
   * often keeps the horizon rolling forward. */
  fullSyncIntervalMs: number
  timeWindowDays: number
  list: ListFn
  persist: (calendarId: string, events: CachedEvent[], syncedAt: number) => void
  /** Deletes the given cache ids; returns how many rows it removed. */
  remove: (calendarId: string, ids: string[]) => number
  /** Full sync only: deletes cached rows overlapping `window` that are not in
   * `keep`; returns how many rows it removed. */
  prune: (calendarId: string, window: SyncWindow, keep: string[]) => number
  setToken: (calendarId: string, token: string | null) => void
  setFullSyncAt: (calendarId: string, at: number) => void
  now: () => number
}

export interface SyncOk {
  kind: 'ok' | 'full' | 'full-resync'
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
    const callArgs: ListEventsArgs = pageToken ? { ...initialArgs, pageToken } : { ...initialArgs }
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
  const window = syncWindow(args)
  const windowArgs: ListEventsArgs = {
    timeMin: new Date(window.from).toISOString(),
    timeMax: new Date(window.to).toISOString(),
  }
  const fullDue =
    args.currentSyncToken === null ||
    args.lastFullSyncAt === null ||
    args.now() - args.lastFullSyncAt >= args.fullSyncIntervalMs

  let kind: SyncOk['kind'] = fullDue ? 'full' : 'ok'
  let result = await collect(
    args.list,
    args.accessToken,
    args.calendarId,
    fullDue ? windowArgs : { syncToken: args.currentSyncToken as string },
  )

  if (result.invalid) {
    kind = 'full-resync'
    result = await collect(args.list, args.accessToken, args.calendarId, windowArgs)
  }

  const cache = new Map<string, CachedEvent>()
  const diff = applyEventsDiff(cache, args.calendarId, result.events, args.now())
  args.persist(args.calendarId, [...cache.values()], args.now())

  const cancelled = result.events
    .filter((ev) => ev.status === 'cancelled')
    .map((ev) => cacheKey(args.calendarId, ev.id))
  let deletes = cancelled.length > 0 ? args.remove(args.calendarId, cancelled) : 0
  if (kind !== 'ok') {
    // A window listing is the whole truth for that window, so anything we
    // still cache there that Google didn't return was deleted while we
    // weren't looking.
    deletes += args.prune(args.calendarId, window, [...cache.keys()])
  }

  if (result.nextSyncToken) args.setToken(args.calendarId, result.nextSyncToken)
  if (kind !== 'ok') args.setFullSyncAt(args.calendarId, args.now())
  return { kind, upserts: diff.upserts, deletes }
}

const syncWindow = (args: SyncArgs): SyncWindow => {
  const day = 86_400_000
  return {
    from: args.now() - args.timeWindowDays * day,
    to: args.now() + args.timeWindowDays * day,
  }
}
