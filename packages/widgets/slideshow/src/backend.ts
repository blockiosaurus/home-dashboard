import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  albumId: z.string().min(1),
})

export type ListAlbumMedia = (
  accessToken: string,
  albumId: string,
) => Promise<Array<{ baseUrl: string }>>

export const createSlideshowBackend = (
  list: ListAlbumMedia,
  getAccessToken: () => Promise<string | null>,
): WidgetBackend => ({
  intervalMs: 60 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    const token = await getAccessToken()
    if (!token) {
      ctx.publish({ baseUrls: [], fetchedAt: ctx.now().getTime() })
      return
    }
    const media = await list(token, cfg.albumId)
    ctx.publish({ baseUrls: media.map((m) => m.baseUrl), fetchedAt: ctx.now().getTime() })
  },
})
