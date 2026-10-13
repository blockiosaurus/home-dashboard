import { describe, expect, it, vi } from 'vitest'
import type { GoogleEvent } from './google-client'
import { type SyncArgs, syncCalendarOnce } from './runner'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-13T12:00:00Z')

const ev = (id: string, extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id,
  etag: `e-${id}`,
  summary: id,
  start: { dateTime: '2026-10-14T12:00:00Z' },
  end: { dateTime: '2026-10-14T13:00:00Z' },
  ...extra,
})

const baseArgs = (overrides: Partial<SyncArgs> = {}): SyncArgs => ({
  calendarId: 'c1',
  accessToken: 'A',
  currentSyncToken: 'OLD',
  lastFullSyncAt: NOW - 60_000,
  fullSyncIntervalMs: DAY,
  timeWindowDays: 90,
  list: vi.fn(async () => ({ events: [], nextSyncToken: 'NEW' })),
  persist: vi.fn(),
  remove: vi.fn(() => 0),
  prune: vi.fn(() => 0),
  setToken: vi.fn(),
  setFullSyncAt: vi.fn(),
  now: () => NOW,
  ...overrides,
})

const windowArgs = {
  timeMin: new Date(NOW - 90 * DAY).toISOString(),
  timeMax: new Date(NOW + 90 * DAY).toISOString(),
}

describe('syncCalendarOnce', () => {
  it('uses sync token if present, persists nextSyncToken', async () => {
    const args = baseArgs({
      list: vi.fn(async () => ({ events: [ev('g1')], nextSyncToken: 'NEW' })),
    })
    const result = await syncCalendarOnce(args)
    expect(args.list).toHaveBeenCalledWith('A', 'c1', { syncToken: 'OLD' })
    expect(args.persist).toHaveBeenCalledWith('c1', expect.any(Array), NOW)
    expect(args.setToken).toHaveBeenCalledWith('c1', 'NEW')
    expect(args.setFullSyncAt).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: 'ok', upserts: 1, deletes: 0 })
  })

  it('falls back to full sync when token invalid', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ events: [], syncTokenInvalid: true })
      .mockResolvedValueOnce({ events: [], nextSyncToken: 'NEW' })
    const args = baseArgs({ list })
    const result = await syncCalendarOnce(args)
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith('A', 'c1', windowArgs)
    expect(args.setFullSyncAt).toHaveBeenCalledWith('c1', NOW)
    expect(result.kind).toBe('full-resync')
  })

  it('removes events Google reports as cancelled during an incremental sync', async () => {
    const args = baseArgs({
      list: vi.fn(async () => ({
        events: [ev('g1'), { id: 'gone', etag: 'x', status: 'cancelled' }],
        nextSyncToken: 'NEW',
      })),
      remove: vi.fn(() => 1),
    })
    const result = await syncCalendarOnce(args)
    expect(args.remove).toHaveBeenCalledWith('c1', ['c1::gone'])
    const persisted = (args.persist as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    expect(persisted.map((e: { id: string }) => e.id)).toEqual(['c1::g1'])
    expect(result.deletes).toBe(1)
  })

  it('reports only deletes that actually removed a cached row', async () => {
    const args = baseArgs({
      list: vi.fn(async () => ({
        events: [{ id: 'never-cached', etag: 'x', status: 'cancelled' }],
        nextSyncToken: 'NEW',
      })),
      remove: vi.fn(() => 0),
    })
    const result = await syncCalendarOnce(args)
    expect(result.deletes).toBe(0)
  })

  it('re-runs a full window sync once the last one is older than the interval', async () => {
    // Without this, events dated past the first sync's 90-day horizon were
    // never fetched unless someone edited them.
    const args = baseArgs({
      lastFullSyncAt: NOW - DAY - 1,
      list: vi.fn(async () => ({ events: [ev('g1')], nextSyncToken: 'NEW' })),
    })
    const result = await syncCalendarOnce(args)
    expect(args.list).toHaveBeenCalledTimes(1)
    expect(args.list).toHaveBeenCalledWith('A', 'c1', windowArgs)
    expect(args.setToken).toHaveBeenCalledWith('c1', 'NEW')
    expect(args.setFullSyncAt).toHaveBeenCalledWith('c1', NOW)
    expect(result.kind).toBe('full')
  })

  it('does a full window sync when no full sync was ever recorded', async () => {
    const args = baseArgs({ lastFullSyncAt: null })
    await syncCalendarOnce(args)
    expect(args.list).toHaveBeenCalledWith('A', 'c1', windowArgs)
    expect(args.setFullSyncAt).toHaveBeenCalledWith('c1', NOW)
  })

  it('a full sync prunes cached events in the window that Google no longer returns', async () => {
    const args = baseArgs({
      currentSyncToken: null,
      list: vi.fn(async () => ({
        events: [ev('keep'), { id: 'gone', etag: 'x', status: 'cancelled' }],
        nextSyncToken: 'NEW',
      })),
      remove: vi.fn(() => 1),
      prune: vi.fn(() => 2),
    })
    const result = await syncCalendarOnce(args)
    expect(args.prune).toHaveBeenCalledWith('c1', { from: NOW - 90 * DAY, to: NOW + 90 * DAY }, [
      'c1::keep',
    ])
    expect(result.deletes).toBe(3)
  })

  it('an incremental sync never prunes', async () => {
    const args = baseArgs()
    await syncCalendarOnce(args)
    expect(args.prune).not.toHaveBeenCalled()
  })
})
