import type { WidgetBackendContext } from '@dashboard/core'
import { describe, expect, it, vi } from 'vitest'
import { createSlideshowBackend } from './backend'

const fixedNow = new Date('2026-01-01T00:00:00Z')

const makeCtx = (config: unknown, publish: (payload: unknown) => void): WidgetBackendContext => ({
  instanceId: 'photos-1',
  config,
  publish,
  now: () => fixedNow,
})

describe('createSlideshowBackend', () => {
  it('publishes local photos for a local config', async () => {
    const list = vi.fn().mockResolvedValue(['/photos/a.jpg'])
    const backend = createSlideshowBackend({ local: { list } })
    const publish = vi.fn()

    await backend.run(makeCtx({ source: 'local' }, publish))

    expect(list).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({
      baseUrls: ['/photos/a.jpg'],
      fetchedAt: fixedNow.getTime(),
    })
  })

  // Scenes saved before the google-photos/ambient sources were removed can
  // still have `source: 'google-photos'` (with an albumId) or `'ambient'` in
  // their stored config. The backend must not throw on that — it should keep
  // publishing local photos so the instance doesn't silently go dark with no
  // way to fix it from the UI.
  it('tolerates a legacy google-photos config and still publishes local photos', async () => {
    const list = vi.fn().mockResolvedValue(['/photos/b.jpg'])
    const backend = createSlideshowBackend({ local: { list } })
    const publish = vi.fn()

    await backend.run(makeCtx({ source: 'google-photos', albumId: 'legacy-album' }, publish))

    expect(list).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({
      baseUrls: ['/photos/b.jpg'],
      fetchedAt: fixedNow.getTime(),
    })
  })

  it('tolerates a legacy ambient config and still publishes local photos', async () => {
    const list = vi.fn().mockResolvedValue(['/photos/c.jpg'])
    const backend = createSlideshowBackend({ local: { list } })
    const publish = vi.fn()

    await backend.run(makeCtx({ source: 'ambient' }, publish))

    expect(list).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({
      baseUrls: ['/photos/c.jpg'],
      fetchedAt: fixedNow.getTime(),
    })
  })

  it('tolerates a config with no source key at all', async () => {
    const list = vi.fn().mockResolvedValue([])
    const backend = createSlideshowBackend({ local: { list } })
    const publish = vi.fn()

    await expect(backend.run(makeCtx({}, publish))).resolves.toBeUndefined()
    expect(list).toHaveBeenCalledTimes(1)
  })
})
