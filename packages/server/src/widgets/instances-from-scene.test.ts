import { describe, expect, it } from 'vitest'
import { instancesFromScene } from './instances-from-scene'

describe('instancesFromScene', () => {
  it('extracts widget instances from a scene cells array', () => {
    const cells = [
      { instanceId: 'a', widgetId: 'weather', x: 0, y: 0, w: 4, h: 2, config: { lat: 1, lon: 2 } },
      { instanceId: 'b', widgetId: 'agenda', x: 4, y: 0, w: 4, h: 2, config: {} },
    ]
    const out = instancesFromScene(cells)
    expect(out).toEqual([
      { instanceId: 'a', widgetId: 'weather', config: { lat: 1, lon: 2 } },
      { instanceId: 'b', widgetId: 'agenda', config: {} },
    ])
  })
})
