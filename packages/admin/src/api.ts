export interface SystemState {
  firstRunComplete: boolean
  manualScene: string | null
  weatherDefault: {
    lat: number
    lon: number
    unit: 'celsius' | 'fahrenheit'
    label?: string
  } | null
  photosAlbumId: string | null
  googleConfigured: boolean
}

export interface Account {
  id: string
  email: string
  provider: string
  created_at: number
}

export interface Calendar {
  id: string
  accountId: string
  summary: string
  visible: boolean
  color: string | null
}

export interface Person {
  id: string
  name: string
  color: string
  primaryCalendarId: string | null
}

export const api = {
  getScenes: async () => {
    const res = await fetch('/api/scenes')
    if (!res.ok) throw new Error('scenes fetch failed')
    return res.json() as Promise<{
      scenes: Array<{ id: string; name: string; isDefault: boolean; cells: unknown[] }>
    }>
  },
  putScene: async (scene: { id: string; name: string; isDefault: boolean; cells: unknown[] }) => {
    const res = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scene),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        issues?: Array<{ path: string; message: string }>
      }
      const details = body.issues?.map((i) => `${i.path}: ${i.message}`).join('; ')
      throw new Error(
        body.error ? `${body.error}${details ? ` — ${details}` : ''}` : 'scene save failed',
      )
    }
    return res.json()
  },
  getWidgets: async () => {
    const res = await fetch('/api/widgets')
    if (!res.ok) throw new Error('widgets fetch failed')
    return res.json() as Promise<{
      widgets: Array<{
        id: string
        name: string
        description: string
        defaultSize: { w: number; h: number }
        minSize: { w: number; h: number }
        defaultConfig: Record<string, unknown>
      }>
    }>
  },
  getSystem: async () => {
    const res = await fetch('/api/system')
    if (!res.ok) throw new Error('system fetch failed')
    return res.json() as Promise<SystemState>
  },
  putSystem: async (patch: Record<string, unknown>) => {
    const res = await fetch('/api/system', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error('system save failed')
    return res.json() as Promise<SystemState>
  },
  getPeople: async () => {
    const res = await fetch('/api/people')
    if (!res.ok) throw new Error('people fetch failed')
    return res.json() as Promise<{ people: Person[] }>
  },
  putPerson: async (
    id: string,
    body: { name: string; color: string; primaryCalendarId?: string | null },
  ) => {
    const res = await fetch(`/api/people/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('person save failed')
    return res.json()
  },
  deletePerson: async (id: string) => {
    const res = await fetch(`/api/people/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('person delete failed')
  },
  oauthStart: async () => {
    const res = await fetch('/api/oauth/start', { method: 'POST' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `oauth start failed (${res.status})`)
    }
    return res.json() as Promise<{
      userCode: string
      verificationUrl: string
      deviceCode: string
      intervalSeconds: number
    }>
  },
  oauthPoll: async (deviceCode: string) => {
    const res = await fetch('/api/oauth/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    })
    if (!res.ok) throw new Error('oauth poll failed')
    return res.json() as Promise<{
      status: 'pending' | 'ok' | 'denied' | 'expired' | 'unknown' | 'error'
    }>
  },
  getAlbums: async () => {
    const res = await fetch('/api/google/albums')
    if (!res.ok) throw new Error('albums fetch failed')
    return res.json() as Promise<{ albums: Array<{ id: string; title: string }> }>
  },
  ambientRegister: async () => {
    const res = await fetch('/api/photos/ambient/register', { method: 'POST' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `ambient register failed (${res.status})`)
    }
    return res.json() as Promise<{
      deviceId: string
      settingsUri: string
      mediaSourcesSet: boolean
      pollIntervalSeconds: number
    }>
  },
  ambientStatus: async () => {
    const res = await fetch('/api/photos/ambient/status')
    if (res.status === 404) return null
    if (!res.ok) throw new Error('ambient status failed')
    return res.json() as Promise<{
      deviceId: string
      settingsUri: string
      mediaSourcesSet: boolean
      pollIntervalSeconds: number
    }>
  },
  ambientReset: async () => {
    const res = await fetch('/api/photos/ambient', { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('ambient reset failed')
  },
  getSchedule: async () => {
    const res = await fetch('/api/scene-schedule')
    if (!res.ok) throw new Error('schedule fetch failed')
    return res.json() as Promise<{
      rules: Array<{ id: string; sceneId: string; cronExpr: string; priority: number }>
    }>
  },
  putScheduleRule: async (
    id: string,
    body: { sceneId: string; cronExpr: string; priority: number },
  ) => {
    const res = await fetch(`/api/scene-schedule/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('schedule save failed')
    return res.json()
  },
  deleteScheduleRule: async (id: string) => {
    const res = await fetch(`/api/scene-schedule/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('schedule delete failed')
  },
  getAccounts: async () => {
    const res = await fetch('/api/accounts')
    if (!res.ok) throw new Error('accounts fetch failed')
    return res.json() as Promise<{ accounts: Account[] }>
  },
  deleteAccount: async (id: string) => {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('account delete failed')
  },
  getCalendars: async () => {
    const res = await fetch('/api/calendars')
    if (!res.ok) throw new Error('calendars fetch failed')
    return res.json() as Promise<{ calendars: Calendar[] }>
  },
  putCalendar: async (id: string, patch: { visible?: boolean; color?: string | null }) => {
    const res = await fetch(`/api/calendars/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error('calendar save failed')
    return res.json() as Promise<Calendar>
  },
}
