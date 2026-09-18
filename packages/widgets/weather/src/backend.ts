import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  lat: z.number().optional(),
  lon: z.number().optional(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
})

export const createWeatherBackend = (
  fetcher: (input: {
    lat: number
    lon: number
    unit: 'celsius' | 'fahrenheit'
  }) => Promise<unknown>,
): WidgetBackend => ({
  intervalMs: 15 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    // A weather widget added from the palette has no coordinates until the
    // family picks a location, so publish a payload the view can explain
    // rather than throwing and leaving the tile on "Loading weather…".
    if (cfg.lat === undefined || cfg.lon === undefined) {
      ctx.publish({ error: 'no-location' })
      return
    }
    const data = await fetcher({ lat: cfg.lat, lon: cfg.lon, unit: cfg.unit ?? 'fahrenheit' })
    ctx.publish(data)
  },
})
