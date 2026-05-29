import { fetch } from 'undici'

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  })
  // 200 = revoked. 400 with invalid_token = already revoked — both are success for us.
  if (res.status === 200 || res.status === 400) return
  throw new Error(`revoke failed: ${res.status}`)
}
