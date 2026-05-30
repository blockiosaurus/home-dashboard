import { type Response, fetch } from 'undici'

const API = 'https://photosambient.googleapis.com/v1'

const failWithBody = async (label: string, res: Response): Promise<never> => {
  const body = await res.text().catch(() => '')
  let detail = body
  try {
    const j = JSON.parse(body) as { error?: { message?: string } }
    if (j.error?.message) detail = j.error.message
  } catch {
    // not JSON
  }
  throw new Error(`${label} failed: ${res.status} ${detail}`.trim())
}

export interface AmbientDevice {
  deviceId: string
  settingsUri: string
  mediaSourcesSet: boolean
  pollIntervalSeconds: number
}

interface RawDevice {
  deviceId: string
  settingsUri: string
  mediaSourcesSet?: boolean
  pollingConfig?: { pollIntervalSeconds?: number }
}

const mapDevice = (raw: RawDevice): AmbientDevice => ({
  deviceId: raw.deviceId,
  settingsUri: raw.settingsUri,
  mediaSourcesSet: raw.mediaSourcesSet ?? false,
  pollIntervalSeconds: raw.pollingConfig?.pollIntervalSeconds ?? 3600,
})

export const createAmbientDevice = async (accessToken: string): Promise<AmbientDevice> => {
  const res = await fetch(`${API}/devices`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  if (!res.ok) await failWithBody('createAmbientDevice', res)
  return mapDevice((await res.json()) as RawDevice)
}

export const getAmbientDevice = async (
  accessToken: string,
  deviceId: string,
): Promise<AmbientDevice> => {
  const res = await fetch(`${API}/devices/${encodeURIComponent(deviceId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) await failWithBody('getAmbientDevice', res)
  return mapDevice((await res.json()) as RawDevice)
}

export const deleteAmbientDevice = async (accessToken: string, deviceId: string): Promise<void> => {
  const res = await fetch(`${API}/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    await failWithBody('deleteAmbientDevice', res)
  }
}

export interface AmbientMedia {
  id: string
  baseUrl: string
}

export const listAmbientMediaItems = async (
  accessToken: string,
  deviceId: string,
): Promise<AmbientMedia[]> => {
  const params = new URLSearchParams({ deviceId, pageSize: '100' })
  const res = await fetch(`${API}/mediaItems?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) await failWithBody('listAmbientMediaItems', res)
  const j = (await res.json()) as {
    mediaItems?: Array<{ id: string; mediaFile?: { baseUrl: string } }>
  }
  return (j.mediaItems ?? [])
    .filter((m): m is { id: string; mediaFile: { baseUrl: string } } =>
      Boolean(m.mediaFile?.baseUrl),
    )
    .map((m) => ({ id: m.id, baseUrl: m.mediaFile.baseUrl }))
}
