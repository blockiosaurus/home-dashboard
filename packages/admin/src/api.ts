export const api = {
  getScenes: async () => {
    const res = await fetch('/api/scenes')
    if (!res.ok) throw new Error('scenes fetch failed')
    return res.json() as Promise<{ scenes: Array<{ id: string; name: string; isDefault: boolean; cells: unknown[] }> }>
  },
  putScene: async (scene: { id: string; name: string; isDefault: boolean; cells: unknown[] }) => {
    const res = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scene),
    })
    if (!res.ok) throw new Error('scene save failed')
    return res.json()
  },
  getWidgets: async () => {
    const res = await fetch('/api/widgets')
    if (!res.ok) throw new Error('widgets fetch failed')
    return res.json() as Promise<{
      widgets: Array<{ id: string; name: string; defaultSize: { w: number; h: number }; minSize: { w: number; h: number } }>
    }>
  },
  getSystem: async () => {
    const res = await fetch('/api/system')
    if (!res.ok) throw new Error('system fetch failed')
    return res.json() as Promise<{
      firstRunComplete: boolean
      manualScene: string | null
      weatherDefault: { lat: number; lon: number; unit: 'celsius' | 'fahrenheit'; label?: string } | null
      photosAlbumId: string | null
    }>
  },
  putSystem: async (patch: Record<string, unknown>) => {
    const res = await fetch('/api/system', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error('system save failed')
    return res.json()
  },
  getPeople: async () => {
    const res = await fetch('/api/people')
    if (!res.ok) throw new Error('people fetch failed')
    return res.json() as Promise<{ people: Array<{ id: string; name: string; color: string }> }>
  },
  putPerson: async (id: string, body: { name: string; color: string }) => {
    const res = await fetch(`/api/people/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('person save failed')
    return res.json()
  },
  oauthStart: async () => {
    const res = await fetch('/api/oauth/start', { method: 'POST' })
    if (!res.ok) throw new Error('oauth start failed')
    return res.json() as Promise<{ userCode: string; verificationUrl: string; deviceCode: string }>
  },
  oauthPoll: async (deviceCode: string) => {
    const res = await fetch('/api/oauth/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    })
    if (!res.ok) throw new Error('oauth poll failed')
    return res.json() as Promise<{ status: 'pending' | 'ok' | 'denied' | 'expired' | 'unknown' | 'error' }>
  },
  getAlbums: async () => {
    const res = await fetch('/api/google/albums')
    if (!res.ok) throw new Error('albums fetch failed')
    return res.json() as Promise<{ albums: Array<{ id: string; title: string }> }>
  },
  getSchedule: async () => {
    const res = await fetch('/api/scene-schedule')
    if (!res.ok) throw new Error('schedule fetch failed')
    return res.json() as Promise<{
      rules: Array<{ id: string; sceneId: string; cronExpr: string; priority: number }>
    }>
  },
  putScheduleRule: async (id: string, body: { sceneId: string; cronExpr: string; priority: number }) => {
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
}
