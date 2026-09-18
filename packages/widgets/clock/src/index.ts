import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { ClockView } from './view'

const ClockConfigSchema = z.object({
  format: z.enum(['12h', '24h']).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ClockConfigSchema>> = {
  id: 'clock',
  name: 'Clock',
  description: 'The time and date, big and readable.',
  defaultSize: { w: 8, h: 1 },
  minSize: { w: 4, h: 1 },
  configSchema: ClockConfigSchema,
  defaultConfig: { format: '12h' },
}

export default {
  ...definition,
  Render: ClockView,
}
