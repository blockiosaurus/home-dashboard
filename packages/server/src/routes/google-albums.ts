import type { FastifyInstance } from 'fastify'
import { listSharedAlbums } from '../sync/google-photos'

export interface AlbumsDeps {
  getAccessToken: () => Promise<string | null>
}

export const registerGoogleAlbumsRoute = (app: FastifyInstance, deps: AlbumsDeps) => {
  app.get('/api/google/albums', async (_, reply) => {
    const token = await deps.getAccessToken()
    if (!token) {
      reply.code(401)
      return { error: 'not authenticated with google' }
    }
    const albums = await listSharedAlbums(token)
    return { albums }
  })
}
