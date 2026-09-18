import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { SlideshowView } from './view'

const ConfigSchema = z.object({
  // Same legacy tolerance as backend.ts's Config: a scene saved before
  // google-photos/ambient were removed may still have a non-'local' source
  // value. Coerce it instead of failing scene validation.
  // z.any() (not z.unknown()) keeps this schema's zod _input type assignable
  // to WidgetDefinition's ZodType<TConfig>, whose default Input=Output would
  // otherwise reject a schema that legitimately accepts a broader input (any
  // legacy source value) than it outputs ('local').
  source: z
    .any()
    .transform((): 'local' => 'local')
    .optional(),
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
