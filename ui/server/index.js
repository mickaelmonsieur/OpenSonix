import Fastify           from 'fastify'
import fastifyCookie     from '@fastify/cookie'
import fastifyStatic     from '@fastify/static'
import fastifyWebsocket  from '@fastify/websocket'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync }    from 'node:fs'
import baresip                    from './baresip.js'
import { verifyAccess }           from './auth.js'
import db                         from './db.js'
import { getAudioLevels }         from './alsa.js'
import './state.js'                    // side-effect: registers baresip event handlers

import authRoutes    from './routes/auth.js'
import callRoutes    from './routes/call.js'
import configRoutes  from './routes/config.js'
import networkRoutes from './routes/network.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT      = parseInt(process.env.PORT ?? '80', 10)
const DIST      = join(__dirname, '..', 'dist')
const hasDist   = existsSync(join(DIST, 'index.html'))

// ── Fastify instance ──────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
})

await fastify.register(fastifyCookie)
await fastify.register(fastifyWebsocket)

if (hasDist) {
  await fastify.register(fastifyStatic, { root: DIST, wildcard: false })
}

// ── API routes ────────────────────────────────────────────────────────────────

await fastify.register(authRoutes,    { prefix: '/api/auth' })
await fastify.register(callRoutes,    { prefix: '/api/call' })
await fastify.register(configRoutes,  { prefix: '/api' })
await fastify.register(networkRoutes, { prefix: '/api/network' })

// ── WebSocket /ws — server-push events to the browser ────────────────────────

const clients = new Set()

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data })
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(msg)
  }
}

// ── Audio level polling (active only during an established call) ──────────────

let levelTimer = null

function getDevices() {
  const q = key => db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value
  return {
    deviceIn:  q('audio_device_in')  ?? 'hw:1,0',
    deviceOut: q('audio_device_out') ?? 'hw:1,0',
  }
}

function startLevelPolling() {
  if (levelTimer) return
  levelTimer = setInterval(async () => {
    const { deviceIn, deviceOut } = getDevices()
    try {
      const levels = await getAudioLevels(deviceIn, deviceOut)
      broadcast('audio:level', levels)
    } catch {}
  }, 300)
}

function stopLevelPolling() {
  if (levelTimer) { clearInterval(levelTimer); levelTimer = null }
  broadcast('audio:level', { tx: 0, rx: 0 })
}

// Map baresip events to browser WebSocket messages
baresip.on('connected',        ()  => broadcast('baresip:connected', {}))
baresip.on('disconnected',     ()  => broadcast('baresip:lost',      {}))
baresip.on('CALL_INCOMING',    msg => broadcast('call:incoming',    { uri: msg.peeruri ?? '' }))
baresip.on('CALL_RINGING',     ()  => broadcast('call:ringing',     {}))
baresip.on('CALL_ESTABLISHED', msg => {
  broadcast('call:established', { uri: msg.peeruri ?? '' })
  startLevelPolling()
})
baresip.on('CALL_CLOSED',      msg => {
  stopLevelPolling()
  broadcast('call:closed', { reason: msg.reason ?? '' })
})
baresip.on('REGISTER_OK',      ()  => broadcast('reg:ok',           {}))
baresip.on('REGISTER_FAIL',    msg => broadcast('reg:fail',         { reason: msg.reason ?? '' }))

fastify.get('/ws', { websocket: true }, (socket, req) => {
  const token = req.query?.token
  try {
    verifyAccess(token)
  } catch {
    socket.close(1008, 'Unauthorized')
    return
  }
  clients.add(socket)
  socket.on('close', () => clients.delete(socket))
})

// ── SPA fallback — non-API 404s → index.html ─────────────────────────────────

fastify.setNotFoundHandler((req, reply) => {
  if (!hasDist || req.url.startsWith('/api') || req.url === '/ws') {
    return reply.code(404).send({ error: 'Not found' })
  }
  return reply.sendFile('index.html')
})

// ── Start ─────────────────────────────────────────────────────────────────────

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

const shutdown = () => {
  baresip.destroy()
  fastify.close(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)
