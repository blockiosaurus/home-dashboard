export interface NetworkInterfaceInfo {
  family: string | number
  internal: boolean
  address: string
}

export interface BuildAdminUrlsInput {
  hostname: string
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>
  port: number
}

const isIPv4 = (family: string | number): boolean => family === 'IPv4' || family === 4

/**
 * Pure function so it can be unit-tested with fake `os.hostname()` /
 * `os.networkInterfaces()` data. The route calls it with the real values.
 *
 * Produces the mDNS hostname URL first (what most phones on the same Wi-Fi
 * can resolve without knowing an IP), then one URL per non-internal IPv4
 * interface as a fallback for networks without mDNS.
 */
export const buildAdminUrls = ({ hostname, interfaces, port }: BuildAdminUrlsInput): string[] => {
  const portSuffix = port === 80 ? '' : `:${port}`
  const bareHostname = hostname.replace(/\.local$/, '')
  const urls = [`http://${bareHostname}.local${portSuffix}/admin/`]

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (isIPv4(entry.family) && !entry.internal) {
        urls.push(`http://${entry.address}${portSuffix}/admin/`)
      }
    }
  }

  return urls
}
