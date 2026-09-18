import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  // Scenes saved before the google-photos/ambient sources were removed may
  // still carry `source: 'google-photos'` or `'ambient'` (or an albumId
  // alongside it). Coerce any value — or a missing key — to 'local' instead
  // of throwing, so a stale config keeps publishing local photos rather than
  // silently going dark with no way for the family to fix it from the UI.
  source: z.unknown().transform((): 'local' => 'local'),
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
