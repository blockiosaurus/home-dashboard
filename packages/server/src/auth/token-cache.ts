type Refresh = (refreshToken: string) => Promise<{ accessToken: string; expiresAt: number }>

export interface TokenCache {
  get: (refreshToken: string) => Promise<string>
}

export const createTokenCache = (refresh: Refresh, skewMs = 30_000): TokenCache => {
  const map = new Map<string, { token: string; expiresAt: number }>()
  return {
    get: async (rt) => {
      const cached = map.get(rt)
      if (cached && cached.expiresAt - skewMs > Date.now()) return cached.token
      const { accessToken, expiresAt } = await refresh(rt)
      map.set(rt, { token: accessToken, expiresAt })
      return accessToken
    },
  }
}
