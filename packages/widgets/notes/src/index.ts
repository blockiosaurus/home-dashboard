import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { NotesView } from './view'

const ConfigSchema = z.object({
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'notes',
  name: 'Notes',
  description: 'A scratch pad for messages to the family.',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
  defaultConfig: { title: 'Notes' },
}

export default { ...definition, Render: NotesView }
