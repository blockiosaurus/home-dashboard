import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { SlideshowView } from './view'

const ConfigSchema = z.object({
  source: z.literal('local').optional(),
  intervalMs: z.number().int().min(2000).optional(),
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
