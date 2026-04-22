import db from '../db.js'
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  hashPassword,
  checkPassword,
  authenticate,
} from '../auth.js'

const REFRESH_COOKIE = 'refresh_token'
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
}

function makeAccessPayload(user) {
  return {
    sub: user.id,
    username: user.username,
    mustChangePassword: user.must_change_password === 1,
  }
}

export default async function authRoutes(fastify) {
  // POST /api/auth/login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { username, password } = req.body
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)

    if (!user || !(await checkPassword(password, user.password))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const payload      = makeAccessPayload(user)
    const accessToken  = signAccess(payload)
    const refreshToken = signRefresh({ sub: user.id, username: user.username })

    reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return { token: accessToken, mustChangePassword: payload.mustChangePassword }
  })

  // POST /api/auth/refresh  — issues a new access token from the httpOnly cookie
  fastify.post('/refresh', async (req, reply) => {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (!token) return reply.code(401).send({ error: 'No refresh token' })

    let decoded
    try {
      decoded = verifyRefresh(token)
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub)
    if (!user) return reply.code(401).send({ error: 'User not found' })

    return { token: signAccess(makeAccessPayload(user)) }
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_OPTS.path })
    return { ok: true }
  })

  // POST /api/auth/change-password  (requires valid JWT, works even when mustChangePassword=1)
  fastify.post('/change-password', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword:     { type: 'string', minLength: 8 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub)

    if (!user || !(await checkPassword(currentPassword, user.password))) {
      return reply.code(401).send({ error: 'Invalid current password' })
    }

    const hash = await hashPassword(newPassword)
    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
      .run(hash, user.id)

    const newPayload   = { sub: user.id, username: user.username, mustChangePassword: false }
    const accessToken  = signAccess(newPayload)
    const refreshToken = signRefresh({ sub: user.id, username: user.username })

    reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return { token: accessToken }
  })
}
