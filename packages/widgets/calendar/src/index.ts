import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { CalendarView } from './view'

const ConfigSchema = z.object({
  view: z.enum(['week', 'month', 'day']).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'calendar',
  name: 'Calendar',
  defaultSize: { w: 8, h: 6 },
  minSize: { w: 4, h: 4 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: CalendarView }
