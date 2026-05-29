import { describe, expect, it } from 'vitest'
import { ServerMessageSchema } from './ws'

describe('ServerMessage', () => {
  it('parses widget:data', () => {
    const msg = ServerMessageSchema.parse({
      type: 'widget:data',
      instanceId: 'cal1',
      payload: { events: [] },
    })
    expect(msg.type).toBe('widget:data')
  })

  it('parses scene:updated', () => {
    const msg = ServerMessageSchema.parse({ type: 'scene:updated', sceneId: 's1' })
    expect(msg.type).toBe('scene:updated')
  })

  it('rejects unknown types', () => {
    expect(() => ServerMessageSchema.parse({ type: 'nope' })).toThrow()
  })
})
