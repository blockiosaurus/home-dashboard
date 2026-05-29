import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig(process.env)
const app = await buildApp({ dataDir: config.dataDir })

await app.listen({ port: config.port, host: config.host })
