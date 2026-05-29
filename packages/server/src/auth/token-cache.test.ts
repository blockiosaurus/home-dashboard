import { describe, expect, it, vi } from 'vitest'
import { createTokenCache } from './token-cache'

describe('TokenCache', () => {
  it('returns cached token while fresh', async () => {
    const refresh = vi.fn(async () => ({ accessToken: 'A1', expiresAt: Date.now() + 60_000 }))
    const cache = createTokenCache(refresh)
    await cache.get('rt')
    await cache.get('rt')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when expired', async () => {
    let n = 0
    const refresh = vi.fn(async () => ({
      accessToken: `A${++n}`,
      expiresAt: Date.now() - 1000,
    }))
    const cache = createTokenCache(refresh)
    expect(await cache.get('rt')).toBe('A1')
    expect(await cache.get('rt')).toBe('A2')
  })
})
