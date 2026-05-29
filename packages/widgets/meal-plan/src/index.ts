import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { MealPlanView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'meal-plan',
  name: 'Meal Plan',
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: MealPlanView }
