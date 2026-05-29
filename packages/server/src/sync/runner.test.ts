import { describe, expect, it, vi } from 'vitest'
import { syncCalendarOnce } from './runner'

describe('syncCalendarOnce', () => {
  it('uses sync token if present, persists nextSyncToken', async () => {
    const list = vi.fn(async () => ({
      events: [
        {
          id: 'g1',
          etag: 'e1',
          summary: 'Lunch',
          start: { dateTime: '2026-05-29T12:00:00Z' },
          end: { dateTime: '2026-05-29T13:00:00Z' },
        },
      ],
      nextSyncToken: 'NEW',
    }))
    const persist = vi.fn()
    const setToken = vi.fn()
    const result = await syncCalendarOnce({
      calendarId: 'c1',
      accessToken: 'A',
      currentSyncToken: 'OLD',
      timeWindowDays: 90,
      list,
      persist,
      setToken,
      now: () => 1000,
    })
    expect(list).toHaveBeenCalledWith('A', 'c1', { syncToken: 'OLD' })
    expect(persist).toHaveBeenCalledWith('c1', expect.any(Array), 1000)
    expect(setToken).toHaveBeenCalledWith('c1', 'NEW')
    expect(result.kind).toBe('ok')
  })

  it('falls back to full sync when token invalid', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ events: [], syncTokenInvalid: true })
      .mockResolvedValueOnce({ events: [], nextSyncToken: 'NEW' })
    const result = await syncCalendarOnce({
      calendarId: 'c1',
      accessToken: 'A',
      currentSyncToken: 'OLD',
      timeWindowDays: 90,
      list,
      persist: vi.fn(),
      setToken: vi.fn(),
      now: () => 1000,
    })
    expect(list).toHaveBeenCalledTimes(2)
    expect(result.kind).toBe('full-resync')
  })
})
