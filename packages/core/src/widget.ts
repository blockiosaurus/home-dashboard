import { z } from 'zod'

export const WidgetSizeSchema = z.object({
  w: z.number().int().min(1).max(8),
  h: z.number().int().min(1).max(12),
})

export type WidgetSize = z.infer<typeof WidgetSizeSchema>

export interface WidgetBackendContext {
  instanceId: string
  config: unknown
  publish: (payload: unknown) => void
  now: () => Date
}

export interface WidgetBackend {
  intervalMs: number
  run: (ctx: WidgetBackendContext) => Promise<void>
}

export interface WidgetDefinition<TConfig = unknown, TData = unknown> {
  id: string
  name: string
  defaultSize: WidgetSize
  minSize: WidgetSize
  configSchema: import('zod').ZodType<TConfig>
  backend?: WidgetBackend
}
