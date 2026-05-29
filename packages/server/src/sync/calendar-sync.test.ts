import { describe, expect, it } from 'vitest'
import { applyEventsDiff } from './calendar-sync'
import type { GoogleEvent } from './google-client'

const sample: GoogleEvent = {
  id: 'g1',
  etag: 'e1',
  summary: 'Lunch',
  start: { dateTime: '2026-05-29T12:00:00Z' },
  end: { dateTime: '2026-05-29T13:00:00Z' },
}

describe('applyEventsDiff', () => {
  it('upserts new events', () => {
    const cache = new Map()
    const result = applyEventsDiff(cache, 'c1', [sample], Date.now())
    expect(result.upserts).toBe(1)
    expect(cache.size).toBe(1)
  })

  it('removes events with status=cancelled', () => {
    const cache = new Map()
    applyEventsDiff(cache, 'c1', [sample], Date.now())
    const res = applyEventsDiff(
      cache,
      'c1',
      [{ ...sample, status: 'cancelled' }],
      Date.now(),
    )
    expect(res.deletes).toBe(1)
    expect(cache.size).toBe(0)
  })

  it('ignores events missing start/end', () => {
    const cache = new Map()
    const res = applyEventsDiff(cache, 'c1', [{ id: 'x', etag: 'e' }], Date.now())
    expect(res.upserts).toBe(0)
    expect(res.skipped).toBe(1)
  })
})
