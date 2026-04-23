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
  maxAge: 7 * 24 * 60 * 60,
}

function makeAccessPayload(user) {
  return {
    sub: user.id,
    username: user.username,
    mustChangePassword: user.must_change_password === 1,
  }
}

// ── Rate limiting (per-IP, in-memory) ────────────────────────────────────────

const loginAttempts = new Map() // ip → { count, resetAt }

function getLimitCfg() {
  const get = (key, def) =>
    parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value ?? String(def), 10)
  return {
    maxAttempts: get('login_max_attempts', 10),
    windowMs:    get('login_window_minutes', 15) * 60_000,
  }
}

function isRateLimited(ip) {
  const { maxAttempts } = getLimitCfg()
  const now   = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now >= entry.resetAt) return { limited: false }
  if (entry.count >= maxAttempts) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { limited: false }
}

function recordFailedAttempt(ip) {
  const { windowMs } = getLimitCfg()
  const now   = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs })
  } else {
    entry.count++
  }
}

function clearAttempts(ip) {
  loginAttempts.delete(ip)
}

// ── Password strength ─────────────────────────────────────────────────────────

function checkPasswordStrength(password) {
  const minLen = parseInt(
    db.prepare('SELECT value FROM config WHERE key = ?').get('password_min_length')?.value ?? '12', 10
  )
  const errors = []
  if (password.length < minLen)       errors.push(`au moins ${minLen} caractères`)
  if (!/[A-Z]/.test(password))        errors.push('au moins une majuscule')
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('au moins un caractère spécial')
  return errors
}

// ── Routes ────────────────────────────────────────────────────────────────────

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
    const ip = req.ip

    const { limited, retryAfter } = isRateLimited(ip)
    if (limited) {
      reply.header('Retry-After', retryAfter)
      return reply.code(429).send({
        error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`,
      })
    }

    const { username, password } = req.body
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)

    if (!user || !(await checkPassword(password, user.password))) {
      recordFailedAttempt(ip)
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    clearAttempts(ip)

    const payload      = makeAccessPayload(user)
    const accessToken  = signAccess(payload)
    const refreshToken = signRefresh({ sub: user.id, username: user.username })

    reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return { token: accessToken, mustChangePassword: payload.mustChangePassword }
  })

  // POST /api/auth/refresh
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
  fastify.post('/logout', async (_req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_OPTS.path })
    return { ok: true }
  })

  // POST /api/auth/change-password
  fastify.post('/change-password', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword:     { type: 'string', minLength: 1 },
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

    const strengthErrors = checkPasswordStrength(newPassword)
    if (strengthErrors.length) {
      return reply.code(400).send({
        error: `Mot de passe trop faible : ${strengthErrors.join(', ')}.`,
      })
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

  // GET /api/auth/security-config — public (pre-login) so the login page can show lockout info
  fastify.get('/security-config', async () => {
    const get = key => parseInt(
      db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value ?? '0', 10
    )
    return {
      login_max_attempts:   get('login_max_attempts'),
      login_window_minutes: get('login_window_minutes'),
      password_min_length:  get('password_min_length'),
    }
  })
}
