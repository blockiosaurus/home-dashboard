import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCalendars, listEvents } from './google-client'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('listCalendars', () => {
  it('returns calendar items', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'c1', summary: 'Mom' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const out = await listCalendars('TOKEN')
    expect(out).toEqual([{ id: 'c1', summary: 'Mom' }])
  })
})

describe('listEvents', () => {
  it('uses syncToken when provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextSyncToken: 'NEXT' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const out = await listEvents('TOKEN', 'c1', { syncToken: 'OLD' })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('syncToken=OLD')
    expect(out.nextSyncToken).toBe('NEXT')
  })

  it('returns syncTokenInvalid on 410', async () => {
    fetchMock.mockResolvedValue(new Response('gone', { status: 410 }))
    const out = await listEvents('TOKEN', 'c1', { syncToken: 'X' })
    expect(out.syncTokenInvalid).toBe(true)
  })
})
