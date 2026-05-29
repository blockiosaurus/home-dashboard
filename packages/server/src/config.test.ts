import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('uses defaults when env empty', () => {
    const c = loadConfig({})
    expect(c.port).toBe(3000)
    expect(c.host).toBe('0.0.0.0')
  })

  it('overrides from env', () => {
    const c = loadConfig({ PORT: '4000', DATA_DIR: '/tmp/d' })
    expect(c.port).toBe(4000)
    expect(c.dataDir).toBe('/tmp/d')
  })

  it('rejects non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow()
  })
})
