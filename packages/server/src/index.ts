import { buildApp } from './app'
import { loadConfig } from './config'
import { loadEnvFile } from './env'

const envFile = loadEnvFile()
if (envFile.loaded) {
  console.log(`loaded env from ${envFile.loaded}`)
}

const config = loadConfig(process.env)

const hasGoogleId = Boolean(config.googleClientId && config.googleClientId.length > 0)
const hasGoogleSecret = Boolean(config.googleClientSecret && config.googleClientSecret.length > 0)
console.log(
  `google oauth: ${hasGoogleId && hasGoogleSecret ? 'configured' : 'NOT configured'} ` +
    `(client_id=${hasGoogleId ? 'set' : 'empty'}, client_secret=${hasGoogleSecret ? 'set' : 'empty'})`,
)

const app = await buildApp({
  dataDir: config.dataDir,
  ...(config.googleClientId !== undefined ? { googleClientId: config.googleClientId } : {}),
  ...(config.googleClientSecret !== undefined
    ? { googleClientSecret: config.googleClientSecret }
    : {}),
})

await app.listen({ port: config.port, host: config.host })
