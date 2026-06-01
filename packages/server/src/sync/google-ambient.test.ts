import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAmbientDevice, getAmbientDevice, listAmbientMediaItems } from './google-ambient'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('createAmbientDevice', () => {
  it('POSTs displayName and returns device + settings url', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'D123',
          settingsUri: 'https://photos.app.goo.gl/abc',
          mediaSourcesSet: false,
          pollingConfig: { pollIntervalSeconds: 3600 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const out = await createAmbientDevice('TOKEN', 'My Frame')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://photosambient.googleapis.com/v1/devices')
    const i = init as { method: string; body: string }
    expect(i.method).toBe('POST')
    expect(JSON.parse(i.body)).toEqual({ displayName: 'My Frame' })
    expect(out.deviceId).toBe('D123')
    expect(out.settingsUri).toBe('https://photos.app.goo.gl/abc')
    expect(out.mediaSourcesSet).toBe(false)
  })
})

describe('getAmbientDevice', () => {
  it('GETs and returns mediaSourcesSet status', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'D123',
          settingsUri: 'https://x',
          mediaSourcesSet: true,
          pollingConfig: { pollIntervalSeconds: 3600 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const out = await getAmbientDevice('TOKEN', 'D123')
    const [url] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://photosambient.googleapis.com/v1/devices/D123')
    expect(out.mediaSourcesSet).toBe(true)
  })
})

describe('listAmbientMediaItems', () => {
  it('GETs mediaItems for a device and returns baseUrls', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          mediaItems: [
            { id: 'm1', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/a' } },
            { id: 'm2', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/b' } },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const out = await listAmbientMediaItems('TOKEN', 'D123')
    const [url] = fetchMock.mock.calls[0] ?? []
    expect(url).toContain('deviceId=D123')
    expect(out.map((m) => m.baseUrl)).toEqual([
      'https://lh3.googleusercontent.com/a',
      'https://lh3.googleusercontent.com/b',
    ])
  })

  it('handles empty mediaItems', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(await listAmbientMediaItems('TOKEN', 'D123')).toEqual([])
  })
})
