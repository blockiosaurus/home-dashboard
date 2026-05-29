import { fetch } from 'undici'

const API = 'https://photoslibrary.googleapis.com/v1'

export interface MediaItem {
  id: string
  baseUrl: string
  mimeType?: string
}

export const listAlbumMedia = async (
  accessToken: string,
  albumId: string,
): Promise<MediaItem[]> => {
  const all: MediaItem[] = []
  let pageToken: string | undefined
  for (;;) {
    const body: Record<string, unknown> = { albumId, pageSize: 100 }
    if (pageToken) body.pageToken = pageToken
    const res = await fetch(`${API}/mediaItems:search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`google photos failed: ${res.status}`)
    const j = (await res.json()) as { mediaItems?: MediaItem[]; nextPageToken?: string }
    if (j.mediaItems) all.push(...j.mediaItems)
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return all
}

export const listSharedAlbums = async (
  accessToken: string,
): Promise<Array<{ id: string; title: string }>> => {
  const res = await fetch(`${API}/sharedAlbums?pageSize=50`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`google sharedAlbums failed: ${res.status}`)
  const j = (await res.json()) as { sharedAlbums?: Array<{ id: string; title: string }> }
  return j.sharedAlbums ?? []
}
