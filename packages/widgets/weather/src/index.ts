import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { WeatherView } from './view'

const ConfigSchema = z.object({
  // Optional at the schema level: a freshly added weather widget has no
  // location until the server merges the family's default (or the user picks
  // one), and the view/backend handle the empty case explicitly.
  lat: z.number().optional(),
  lon: z.number().optional(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
  label: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'weather',
  name: 'Weather',
  description: "Current conditions and today's high and low.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
  defaultConfig: { unit: 'fahrenheit' },
}

export default { ...definition, Render: WeatherView }
