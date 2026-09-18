import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { SlideshowView } from './view'

const ConfigSchema = z.object({
  source: z.enum(['local', 'google-photos', 'ambient']).optional(),
  albumId: z.string().optional(),
  intervalMs: z.number().int().min(2000).optional(),
  size: z.enum(['w1200-h1200', 'w800-h800', 'w2000-h2000']).optional(),
  shuffle: z.boolean().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'slideshow',
  name: 'Slideshow',
  description: 'Family photos, one after another.',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
  defaultConfig: { source: 'local', intervalMs: 8000, shuffle: true },
}

export default { ...definition, Render: SlideshowView }
