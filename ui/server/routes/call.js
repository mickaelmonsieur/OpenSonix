import baresip                              from '../baresip.js'
import { authenticate, requirePasswordChanged } from '../auth.js'
import { state }                           from '../state.js'

export default async function callRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  // POST /api/call/dial  { uri }
  fastify.post('/dial', {
    schema: {
      body: {
        type: 'object',
        required: ['uri'],
        properties: { uri: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    if (!baresip.connected) return reply.code(503).send({ error: 'baresip not connected' })
    await baresip.send('dial', req.body.uri)
    return { ok: true }
  })

  // POST /api/call/hangup
  fastify.post('/hangup', async (req, reply) => {
    if (!baresip.connected) return reply.code(503).send({ error: 'baresip not connected' })
    await baresip.send('hangup')
    return { ok: true }
  })

  // POST /api/call/accept
  fastify.post('/accept', async (req, reply) => {
    if (!baresip.connected) return reply.code(503).send({ error: 'baresip not connected' })
    await baresip.send('accept')
    return { ok: true }
  })
}
