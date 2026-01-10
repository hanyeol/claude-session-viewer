import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import chokidar from 'chokidar'
import getPort from 'get-port'
import { CLAUDE_DIR, DEFAULT_PORT } from './constants.js'
import { registerSessionRoutes } from './routes/sessions.js'
import { registerStatisticsRoutes } from './routes/statistics.js'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST_DIR = resolve(SERVER_DIR, '../client')

const server = Fastify({
  logger: true
})

// Plugins
await server.register(websocket)

// Register API routes
await registerSessionRoutes(server)
await registerStatisticsRoutes(server)

if (existsSync(CLIENT_DIST_DIR)) {
  await server.register(fastifyStatic, {
    root: CLIENT_DIST_DIR
  })

  server.setNotFoundHandler((request, reply) => {
    const url = request.raw.url || ''
    if (url.startsWith('/api') || url.startsWith('/ws')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    reply.sendFile('index.html')
  })
}


// WebSocket: Watch for file changes
server.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket) => {
    const projectsDir = join(CLAUDE_DIR, 'projects')

    const watcher = chokidar.watch(projectsDir, {
      ignoreInitial: true,
      persistent: true
    })

    watcher.on('add', (path) => {
      socket.send(JSON.stringify({ type: 'file-added', path }))
    })

    watcher.on('change', (path) => {
      socket.send(JSON.stringify({ type: 'file-changed', path }))
    })

    watcher.on('unlink', (path) => {
      socket.send(JSON.stringify({ type: 'file-deleted', path }))
    })

    socket.on('close', () => {
      watcher.close()
    })

    socket.on('error', (err: Error) => {
      console.error('WebSocket error:', err)
    })
  })
})

// Start server
const start = async () => {
  try {
    const envPort = process.env.PORT ? Number(process.env.PORT) : undefined
    const port = Number.isFinite(envPort) ? envPort : await getPort({ port: DEFAULT_PORT })

    await server.listen({ port })

    if (port !== DEFAULT_PORT) {
      console.log(`Port ${DEFAULT_PORT} is in use, using port ${port} instead`)
    }

    const url = `http://localhost:${port}`
    console.log(`Server running on \x1b[36m${url}\x1b[0m`)
    console.log(`Watching Claude directory: \x1b[36m${CLAUDE_DIR}\x1b[0m`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
