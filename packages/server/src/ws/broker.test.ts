import type { ServerMessage } from '@dashboard/core'
import { describe, expect, it } from 'vitest'
import { createBroker } from './broker'

describe('broker', () => {
  it('delivers messages to all subscribers', () => {
    const broker = createBroker()
    const received: ServerMessage[] = []
    const unsub = broker.subscribe((m) => received.push(m))

    broker.publish({ type: 'calendar:changed' })
    broker.publish({ type: 'scene:active', sceneId: 's1' })

    expect(received).toHaveLength(2)
    expect(received[0]?.type).toBe('calendar:changed')

    unsub()
    broker.publish({ type: 'calendar:changed' })
    expect(received).toHaveLength(2)
  })
})
