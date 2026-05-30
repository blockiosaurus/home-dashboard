import { z } from 'zod'

const Schema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  dataDir: z.string().default('./data'),
  localPhotosDir: z.string().default('./data/photos'),
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
})

export type Config = z.infer<typeof Schema>

export const loadConfig = (env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config =>
  Schema.parse({
    port: env.PORT,
    host: env.HOST,
    dataDir: env.DATA_DIR,
    localPhotosDir: env.LOCAL_PHOTOS_DIR,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  })
