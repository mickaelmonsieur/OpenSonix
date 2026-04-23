import Database      from 'better-sqlite3'
import bcrypt         from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { mkdirSync }  from 'node:fs'
import { dirname, resolve } from 'node:path'

const DB_PATH = resolve(process.env.DB_PATH ?? './opensonix.db')
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const genToken = () => randomBytes(16).toString('hex')  // 128-bit hex, 32 chars

// ── Migrations ───────────────────────────────────────────────────────────────
// Never edit existing entries — append new ones to evolve the schema.
// Each entry: { sql, post?(db) }

const MIGRATIONS = [
  // v1 — initial schema
  {
    sql: `
    CREATE TABLE IF NOT EXISTS users (
      id                   INTEGER PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE,
      password             TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sip_account (
      id        INTEGER PRIMARY KEY,
      registrar TEXT,
      password  TEXT
    );

    CREATE TABLE IF NOT EXISTS call_history (
      id         INTEGER PRIMARY KEY,
      direction  TEXT NOT NULL,
      remote_uri TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at   TEXT,
      duration   INTEGER
    );
    `,
  },

  // v2 — generated SIP username + remote credentials for SENDER mode
  {
    sql: `
    ALTER TABLE sip_account ADD COLUMN username      TEXT;
    ALTER TABLE sip_account ADD COLUMN remote_user   TEXT;
    ALTER TABLE sip_account ADD COLUMN remote_password TEXT;
    `,
    post(database) {
      // Generate username (and password if missing) for any existing rows
      const rows = database.prepare(
        'SELECT id FROM sip_account WHERE username IS NULL OR password IS NULL'
      ).all()
      const stmt = database.prepare(
        'UPDATE sip_account SET username = COALESCE(username, ?), password = COALESCE(password, ?) WHERE id = ?'
      )
      for (const row of rows) stmt.run(genToken(), genToken(), row.id)
    },
  },
]

function migrate() {
  const currentVersion = db.pragma('user_version', { simple: true })
  const pending = MIGRATIONS.slice(currentVersion)

  for (let i = 0; i < pending.length; i++) {
    db.exec(pending[i].sql)
    pending[i].post?.(db)
    db.pragma(`user_version = ${currentVersion + i + 1}`)
  }
}

// ── Seed (first run only) ────────────────────────────────────────────────────

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (userCount > 0) return

  const hash = bcrypt.hashSync('opensonix', 10)
  db.prepare(
    'INSERT INTO users (username, password, must_change_password) VALUES (?, ?, 1)'
  ).run('admin', hash)

  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)')
  db.transaction(() => {
    insertConfig.run('mode',            'RECEIVER')
    insertConfig.run('audio_device_in', 'hw:1,0')
    insertConfig.run('audio_device_out','hw:1,0')
    insertConfig.run('capture_volume',  '80')
    insertConfig.run('playback_volume', '80')
    insertConfig.run('opus_bitrate',    '128000')
    insertConfig.run('opus_stereo',     'true')
    insertConfig.run('opus_fec',        'true')
    insertConfig.run('sip_port',          '7060')
    insertConfig.run('login_max_attempts',  '10')
    insertConfig.run('login_window_minutes','15')
    insertConfig.run('password_min_length', '12')
    insertConfig.run('timezone',            'Europe/Paris')
    insertConfig.run('ntp_server_1',        '0.europe.pool.ntp.org')
    insertConfig.run('ntp_server_2',        '1.europe.pool.ntp.org')
  })()

  // Always exactly one SIP account (id=1) — both credentials app-generated
  db.prepare(
    'INSERT OR IGNORE INTO sip_account (id, username, password, registrar, remote_user, remote_password) VALUES (1, ?, ?, NULL, NULL, NULL)'
  ).run(genToken(), genToken())
}

migrate()
seed()

export default db
