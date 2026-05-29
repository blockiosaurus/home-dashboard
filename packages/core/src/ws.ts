import { z } from 'zod'

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('widget:data'),
    instanceId: z.string(),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('scene:updated'),
    sceneId: z.string(),
  }),
  z.object({
    type: z.literal('scene:active'),
    sceneId: z.string(),
  }),
  z.object({
    type: z.literal('calendar:changed'),
  }),
])

export type ServerMessage = z.infer<typeof ServerMessageSchema>

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe') }),
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>
