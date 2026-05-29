import { fetch } from 'undici'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/photoslibrary.readonly',
].join(' ')

export interface DeviceFlowStart {
  deviceCode: string
  userCode: string
  verificationUrl: string
  intervalSeconds: number
  expiresAt: number
}

export const startDeviceFlow = async (clientId: string): Promise<DeviceFlowStart> => {
  const res = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPES }),
  })
  if (!res.ok) throw new Error(`device flow start failed: ${res.status}`)
  const j = (await res.json()) as {
    device_code: string
    user_code: string
    verification_url: string
    expires_in: number
    interval: number
  }
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUrl: j.verification_url,
    intervalSeconds: j.interval,
    expiresAt: Date.now() + j.expires_in * 1000,
  }
}

export interface DeviceFlowTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export const pollDeviceFlow = async (
  clientId: string,
  clientSecret: string,
  deviceCode: string,
): Promise<DeviceFlowTokens | 'pending' | 'denied' | 'expired'> => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const j = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
  if (j.access_token && j.refresh_token && j.expires_in) {
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + j.expires_in * 1000,
    }
  }
  if (j.error === 'authorization_pending' || j.error === 'slow_down') return 'pending'
  if (j.error === 'access_denied') return 'denied'
  if (j.error === 'expired_token') return 'expired'
  throw new Error(`device flow poll failed: ${JSON.stringify(j)}`)
}

export const refreshAccessToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  return { accessToken: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 }
}
