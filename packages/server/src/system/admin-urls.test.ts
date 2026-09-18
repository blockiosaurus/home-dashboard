import { describe, expect, it } from 'vitest'
import { buildAdminUrls } from './admin-urls'

describe('buildAdminUrls', () => {
  it('puts the mDNS hostname URL first, with the port suffix', () => {
    const urls = buildAdminUrls({ hostname: 'kiosk', interfaces: {}, port: 3000 })
    expect(urls).toEqual(['http://kiosk.local:3000/admin/'])
  })

  it('omits the port suffix when port is 80', () => {
    const urls = buildAdminUrls({ hostname: 'kiosk', interfaces: {}, port: 80 })
    expect(urls).toEqual(['http://kiosk.local/admin/'])
  })

  it('strips a trailing .local from the hostname before appending .local', () => {
    const urls = buildAdminUrls({ hostname: 'kiosk.local', interfaces: {}, port: 3000 })
    expect(urls).toEqual(['http://kiosk.local:3000/admin/'])
  })

  it('adds one URL per non-internal IPv4 interface, using the string family', () => {
    const urls = buildAdminUrls({
      hostname: 'kiosk',
      interfaces: {
        lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.42' }],
      },
      port: 3000,
    })
    expect(urls).toEqual(['http://kiosk.local:3000/admin/', 'http://192.168.1.42:3000/admin/'])
  })

  it('treats the numeric family 4 as IPv4 too', () => {
    const urls = buildAdminUrls({
      hostname: 'kiosk',
      interfaces: {
        eth0: [{ family: 4, internal: false, address: '10.0.0.5' }],
      },
      port: 3000,
    })
    expect(urls).toEqual(['http://kiosk.local:3000/admin/', 'http://10.0.0.5:3000/admin/'])
  })

  it('skips internal and non-IPv4 interfaces', () => {
    const urls = buildAdminUrls({
      hostname: 'kiosk',
      interfaces: {
        eth0: [
          { family: 'IPv4', internal: true, address: '127.0.0.1' },
          { family: 'IPv6', internal: false, address: 'fe80::1' },
        ],
        undef: undefined,
      },
      port: 3000,
    })
    expect(urls).toEqual(['http://kiosk.local:3000/admin/'])
  })
})
