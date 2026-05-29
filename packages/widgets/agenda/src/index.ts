import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { AgendaView } from './view'

const ConfigSchema = z.object({
  daysAhead: z.number().int().min(0).max(7).optional(),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'agenda',
  name: 'Agenda',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: AgendaView }
