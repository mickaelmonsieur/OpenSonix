import { authenticate, requirePasswordChanged } from '../auth.js'
import { readNetworkConfig, writeNetworkConfig } from '../network.js'

export default async function networkRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  // GET /api/network
  fastify.get('/', async () => readNetworkConfig())

  // POST /api/network  { mode, ip, mask, gateway, dns1, dns2, hostname }
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        properties: {
          mode:     { type: 'string', enum: ['dhcp', 'static'] },
          ip:       { type: 'string' },
          mask:     { type: 'string' },
          gateway:  { type: 'string' },
          dns1:     { type: 'string' },
          dns2:     { type: 'string' },
          hostname: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const current = await readNetworkConfig()
    const next    = req.body

    const ipChanged = next.mode === 'static' && next.ip && next.ip !== current.ip

    try {
      await writeNetworkConfig(next)
    } catch (err) {
      const msg = err.code === 'EACCES'
        ? 'Permission refusée : le serveur doit être exécuté en root pour modifier /etc/dhcpcd.conf'
        : `Erreur d'écriture : ${err.message}`
      return reply.code(500).send({ error: msg })
    }

    const response = { ok: true, warning: null }
    if (ipChanged) {
      response.warning = `Paramètres réseau sauvegardés. Si vous avez changé l'adresse IP, reconnectez-vous à la nouvelle adresse : http://${next.ip}`
    }
    return response
  })
}
