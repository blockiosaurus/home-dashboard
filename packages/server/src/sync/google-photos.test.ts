import { afterEach, describe, expect, it, vi } from 'vitest'
import { listAlbumMedia } from './google-photos'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('listAlbumMedia', () => {
  it('paginates through mediaItems search and returns base urls', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaItems: [{ id: '1', baseUrl: 'https://lh3.googleusercontent.com/a' }],
            nextPageToken: 'TOKEN',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaItems: [{ id: '2', baseUrl: 'https://lh3.googleusercontent.com/b' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const out = await listAlbumMedia('TOKEN', 'ALBUM_1')
    expect(out.map((m) => m.id)).toEqual(['1', '2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
