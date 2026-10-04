import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ExtractError,
  type ExtractResult,
  type IngestFile,
  SUPPORTED_MEDIA_TYPES,
} from '../ingest/extract'

/** Base64 inflates by a third; this leaves room for ~20 MB of files, under
 * the API's 32 MB request cap. */
const BODY_LIMIT = 28 * 1024 * 1024
const MAX_FILES = 10

const ExtractBody = z.object({
  files: z
    .array(
      z.object({
        name: z.string().max(255),
        mediaType: z.enum(SUPPORTED_MEDIA_TYPES),
        data: z.string().min(1),
      }),
    )
    .min(1)
    .max(MAX_FILES),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().max(64),
})

export type Extractor = (
  files: IngestFile[],
  ctx: { today: string; timezone: string },
) => Promise<ExtractResult>

/** AI ingress: turn flyers, school calendars and invitation photos into
 * proposed events. Nothing is written here — the admin shows the proposals
 * for review and saves the accepted ones through POST /api/events. */
export const registerIngestRoutes = (app: FastifyInstance, deps: { extract?: Extractor }) => {
  app.post('/api/ingest/extract', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
    if (!deps.extract) {
      reply.code(503)
      return { error: 'AI import is not set up. Add ANTHROPIC_API_KEY to the server env.' }
    }
    const parsed = ExtractBody.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return {
        error: 'invalid upload',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }
    }
    const { files, today, timezone } = parsed.data
    try {
      return await deps.extract(files, { today, timezone })
    } catch (err) {
      if (err instanceof ExtractError) {
        reply.code(422)
        return { error: err.message }
      }
      req.log.error({ err }, 'ingest extract failed')
      reply.code(502)
      return { error: 'Could not reach Claude. Try again in a minute.' }
    }
  })
}
