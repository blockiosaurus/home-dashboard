import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { NotesView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'notes',
  name: 'Notes',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: NotesView }
