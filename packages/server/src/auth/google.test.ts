import { describe, expect, it, vi } from 'vitest'
import { startDeviceFlow } from './google'

vi.mock('undici', () => ({
  fetch: vi.fn(async (url: string) => {
    if (url.includes('device/code')) {
      return new Response(
        JSON.stringify({
          device_code: 'DEV',
          user_code: 'USER1',
          verification_url: 'https://google.com/device',
          expires_in: 1800,
          interval: 5,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('not found', { status: 404 })
  }),
}))

describe('startDeviceFlow', () => {
  it('returns the user code and verification URL', async () => {
    const res = await startDeviceFlow('cid')
    expect(res.userCode).toBe('USER1')
    expect(res.verificationUrl).toBe('https://google.com/device')
    expect(res.deviceCode).toBe('DEV')
  })
})
