import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  source: z.enum(['local', 'google-photos']).default('local'),
  albumId: z.string().optional(),
})

export type ListAlbumMedia = (
  accessToken: string,
  albumId: string,
) => Promise<Array<{ baseUrl: string }>>

export type ListLocalPhotos = () => Promise<string[]>

export interface SlideshowBackendDeps {
  googlePhotos: {
    list: ListAlbumMedia
    getAccessToken: () => Promise<string | null>
  }
  local: {
    list: ListLocalPhotos
  }
}

export const createSlideshowBackend = (deps: SlideshowBackendDeps): WidgetBackend => ({
  intervalMs: 60 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    const fetchedAt = ctx.now().getTime()

    if (cfg.source === 'local') {
      const urls = await deps.local.list()
      ctx.publish({ baseUrls: urls, fetchedAt })
      return
    }

    // google-photos source: requires both an albumId and a working token
    if (!cfg.albumId) {
      ctx.publish({ baseUrls: [], fetchedAt })
      return
    }
    const token = await deps.googlePhotos.getAccessToken()
    if (!token) {
      ctx.publish({ baseUrls: [], fetchedAt })
      return
    }
    const media = await deps.googlePhotos.list(token, cfg.albumId)
    ctx.publish({ baseUrls: media.map((m) => m.baseUrl), fetchedAt })
  },
})
