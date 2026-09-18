import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  source: z.literal('local').default('local'),
})

export type ListLocalPhotos = () => Promise<string[]>

export interface SlideshowBackendDeps {
  local: {
    list: ListLocalPhotos
  }
}

export const createSlideshowBackend = (deps: SlideshowBackendDeps): WidgetBackend => ({
  intervalMs: 60 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    Config.parse(ctx.config)
    const fetchedAt = ctx.now().getTime()
    const urls = await deps.local.list()
    ctx.publish({ baseUrls: urls, fetchedAt })
  },
})
