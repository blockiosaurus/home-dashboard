import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { PackagesView } from './view'

const ConfigSchema = z.object({
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'packages',
  name: 'Packages',
  description: 'Deliveries you are waiting on.',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
  defaultConfig: { title: 'Packages' },
}

export default { ...definition, Render: PackagesView }
