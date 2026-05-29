import { afterEach, describe, expect, it, vi } from 'vitest'
import { revokeRefreshToken } from './google-revoke'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))
afterEach(() => fetchMock.mockReset())

describe('revokeRefreshToken', () => {
  it('POSTs the token to Google revoke endpoint', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await revokeRefreshToken('rt-secret')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect((init as { body: URLSearchParams }).body.toString()).toContain('token=rt-secret')
  })

  it('does not throw on 400 (token already revoked)', async () => {
    fetchMock.mockResolvedValue(new Response('invalid_token', { status: 400 }))
    await expect(revokeRefreshToken('rt')).resolves.toBeUndefined()
  })

  it('throws on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(revokeRefreshToken('rt')).rejects.toThrow(/revoke failed/)
  })
})
