import db                                       from '../db.js'
import { authenticate, requirePasswordChanged } from '../auth.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT     = 100

function intParam(value, fallback) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export default async function historyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  fastify.get('/', async (req) => {
    const page  = clamp(intParam(req.query?.page, 1), 1, 1_000_000)
    const limit = clamp(intParam(req.query?.limit, DEFAULT_LIMIT), 1, MAX_LIMIT)
    const offset = (page - 1) * limit

    const total = db.prepare('SELECT COUNT(*) AS n FROM call_history').get().n
    const rows = db.prepare(`
      SELECT
        id,
        direction,
        remote_uri AS remoteUri,
        started_at AS startedAt,
        ended_at   AS endedAt,
        duration
      FROM call_history
      ORDER BY started_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset)

    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      rows,
    }
  })
}
