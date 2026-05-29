import { z } from 'zod'

export const GRID_COLS = 8
export const GRID_ROWS = 12

export const LayoutCellSchema = z
  .object({
    instanceId: z.string().min(1),
    widgetId: z.string().min(1),
    x: z.number().int().min(0).max(GRID_COLS - 1),
    y: z.number().int().min(0).max(GRID_ROWS - 1),
    w: z.number().int().min(1).max(GRID_COLS),
    h: z.number().int().min(1).max(GRID_ROWS),
    config: z.unknown(),
  })
  .refine((c) => c.x + c.w <= GRID_COLS, { message: 'cell exceeds grid width' })
  .refine((c) => c.y + c.h <= GRID_ROWS, { message: 'cell exceeds grid height' })

export type LayoutCell = z.infer<typeof LayoutCellSchema>

export const SceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  cells: z.array(LayoutCellSchema),
})

export type Scene = z.infer<typeof SceneSchema>
