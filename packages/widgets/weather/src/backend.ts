import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  lat: z.number(),
  lon: z.number(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
})

export const createWeatherBackend = (
  fetcher: (input: { lat: number; lon: number; unit: 'celsius' | 'fahrenheit' }) => Promise<unknown>,
): WidgetBackend => ({
  intervalMs: 15 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    const data = await fetcher({ lat: cfg.lat, lon: cfg.lon, unit: cfg.unit ?? 'fahrenheit' })
    ctx.publish(data)
  },
})
