import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { MealPlanView } from './view'

const ConfigSchema = z.object({
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'meal-plan',
  name: 'Meal Plan',
  description: "What's for dinner each day this week.",
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  configSchema: ConfigSchema,
  defaultConfig: { title: 'Meals' },
}

export default { ...definition, Render: MealPlanView }
