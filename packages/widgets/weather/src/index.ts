import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { WeatherView } from './view'

const ConfigSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
  label: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'weather',
  name: 'Weather',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: WeatherView }
