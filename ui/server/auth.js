import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const ACCESS_SECRET  = process.env.JWT_SECRET         ?? 'dev-secret-change-in-production'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? ACCESS_SECRET + '-refresh'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET not set — using insecure default')
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

export function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' })
}

export function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' })
}

export function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

export function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET)
}

// ── bcrypt helpers ───────────────────────────────────────────────────────────

export function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export function checkPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// ── Fastify preHandlers (import and use directly as preHandler: []) ──────────

export async function authenticate(req, reply) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
  try {
    req.user = verifyAccess(header.slice(7))
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' })
  }
}

// Use after authenticate — blocks all routes while mustChangePassword is true
export async function requirePasswordChanged(req, reply) {
  if (req.user?.mustChangePassword) {
    return reply.code(403).send({ error: 'PASSWORD_CHANGE_REQUIRED' })
  }
}
