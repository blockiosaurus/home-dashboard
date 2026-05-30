import type { FastifyInstance } from 'fastify'
import { listLocalPhotos } from '../sync/local-photos'

export interface PhotosRouteDeps {
  localPhotosDir: string
}

export const registerPhotosRoutes = (app: FastifyInstance, deps: PhotosRouteDeps) => {
  app.get('/api/photos/local', async () => {
    const files = await listLocalPhotos(deps.localPhotosDir)
    return {
      root: deps.localPhotosDir,
      files,
      // Pre-built URLs the client can drop into <img src>. Each segment is
      // URL-encoded; forward slashes preserved so directory structure is
      // visible.
      urls: files.map(
        (rel) => `/photos/${rel.split('/').map(encodeURIComponent).join('/')}`,
      ),
    }
  })
}
