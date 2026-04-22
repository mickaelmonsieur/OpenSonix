import { writeFile }                            from 'node:fs/promises'
import { execFile as _execFile }                from 'node:child_process'
import { promisify }                            from 'node:util'
import { randomBytes }                          from 'node:crypto'
import { networkInterfaces }                    from 'node:os'
import db                                       from '../db.js'
import baresip                                  from '../baresip.js'
import { authenticate, requirePasswordChanged } from '../auth.js'
import { state }                                from '../state.js'
import { listPlaybackDevices, listCaptureDevices, setCaptureVolume, setPlaybackVolume } from '../alsa.js'

const execFile = promisify(_execFile)

const BARESIP_CONF     = '/etc/baresip/config'
const BARESIP_ACCOUNTS = '/etc/baresip/accounts'

const genToken = () => randomBytes(16).toString('hex')

const ALLOWED_KEYS = new Set([
  'mode',
  'audio_device_in', 'audio_device_out',
  'capture_volume',  'playback_volume',
  'opus_bitrate',    'opus_stereo', 'opus_fec',
  'sip_port',
])

// ── helpers ──────────────────────────────────────────────────────────────────

function cfgMap() {
  const rows = db.prepare('SELECT key, value FROM config').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

function getSip() {
  return db.prepare('SELECT * FROM sip_account WHERE id = 1').get() ?? {}
}

function getLocalIPv4() {
  const nets = networkInterfaces()
  for (const name of ['eth0', 'wlan0', ...Object.keys(nets)]) {
    for (const addr of (nets[name] ?? [])) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return null
}

function renderBaresipConf(cfg) {
  return [
    `audio_player     alsa,${cfg.audio_device_out}`,
    `audio_source     alsa,${cfg.audio_device_in}`,
    `audio_samplerate 48000`,
    `audio_channels   2`,
    ``,
    `opus_bitrate     ${cfg.opus_bitrate}`,
    `opus_stereo      ${cfg.opus_stereo === 'true' ? 'yes' : 'no'}`,
    `opus_inbandFEC   ${cfg.opus_fec    === 'true' ? 'yes' : 'no'}`,
    ``,
    `module           ctrl_tcp.so`,
    `module           opus.so`,
    `module           alsa.so`,
    `module           account.so`,
    ``,
    `ctrl_tcp_listen  127.0.0.1:4444`,
    `sip_listen       0.0.0.0:${cfg.sip_port}`,
  ].join('\n') + '\n'
}

function renderBaresipAccounts(cfg, sip) {
  // Both modes: local identity uses generated username.
  // SENDER registers with remote host; RECEIVER just listens.
  if (cfg.mode === 'SENDER' && sip.registrar) {
    return `<sip:${sip.username}@${sip.registrar}:${cfg.sip_port}>;auth_pass=${sip.password ?? ''};regint=60;\n`
  }
  return `<sip:${sip.username}@0.0.0.0:${cfg.sip_port}>;regint=0;\n`
}

async function applyBaresipConfig() {
  const cfg = cfgMap()
  const sip = getSip()
  try {
    await Promise.all([
      writeFile(BARESIP_CONF,     renderBaresipConf(cfg)),
      writeFile(BARESIP_ACCOUNTS, renderBaresipAccounts(cfg, sip)),
    ])
    await execFile('systemctl', ['reload', 'baresip'])
  } catch (err) {
    console.error('[config] baresip reload skipped:', err.message)
  }
}

// ── routes ───────────────────────────────────────────────────────────────────

export default async function configRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  // GET /api/status
  fastify.get('/status', async () => {
    const cfg = cfgMap()
    const sip = getSip()
    const dialUri = (cfg.mode === 'SENDER' && sip.registrar && sip.remote_user)
      ? `sip:${sip.remote_user}@${sip.registrar}:${cfg.sip_port}`
      : null
    return {
      mode:             cfg.mode ?? 'RECEIVER',
      call:             state.call,
      baresipConnected: baresip.connected,
      registration:     state.registration,
      dialUri,
    }
  })

  // GET /api/config
  fastify.get('/config', async () => {
    const cfg = cfgMap()
    const sip = getSip()
    const [playback, capture] = await Promise.all([listPlaybackDevices(), listCaptureDevices()])
    return {
      ...cfg,
      sip: {
        username:        sip.username        ?? null,
        password:        sip.password        ?? null,
        registrar:       sip.registrar       ?? '',
        remote_user:     sip.remote_user     ?? '',
        remote_password: sip.remote_password ?? '',
      },
      localIp:  getLocalIPv4(),
      devices: { playback, capture },
    }
  })

  // POST /api/config  { key, value }
  fastify.post('/config', {
    schema: {
      body: {
        type: 'object',
        required: ['key', 'value'],
        properties: {
          key:   { type: 'string' },
          value: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { key, value } = req.body
    if (!ALLOWED_KEYS.has(key)) {
      return reply.code(400).send({ error: `Unknown config key: ${key}` })
    }

    db.prepare('UPDATE config SET value = ? WHERE key = ?').run(value, key)
    applyBaresipConfig()

    const cfg = cfgMap()
    if (key === 'capture_volume') {
      setCaptureVolume(cfg.audio_device_in, value)
        .catch(e => console.error('[config] amixer capture:', e.message))
    }
    if (key === 'playback_volume') {
      setPlaybackVolume(cfg.audio_device_out, value)
        .catch(e => console.error('[config] amixer playback:', e.message))
    }
    if (key === 'audio_device_in' && baresip.connected) {
      baresip.send('ausrc', value).catch(e => console.error('[config] ausrc:', e.message))
    }
    if (key === 'audio_device_out' && baresip.connected) {
      baresip.send('auplay', value).catch(e => console.error('[config] auplay:', e.message))
    }

    return { ok: true }
  })

  // POST /api/config/sip  { registrar, remote_user, remote_password }
  // Saves the remote device credentials used by the SENDER to dial.
  fastify.post('/config/sip', {
    schema: {
      body: {
        type: 'object',
        properties: {
          registrar:       { type: 'string' },
          remote_user:     { type: 'string' },
          remote_password: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { registrar = '', remote_user = '', remote_password = '' } = req.body
    db.prepare(
      'UPDATE sip_account SET registrar = ?, remote_user = ?, remote_password = ? WHERE id = 1'
    ).run(registrar || null, remote_user || null, remote_password || null)

    applyBaresipConfig()
    return { ok: true }
  })

  // POST /api/config/sip/rotate
  // Generates new local SIP username + password. Both sides must be reconfigured.
  fastify.post('/config/sip/rotate', async () => {
    const username = genToken()
    const password = genToken()
    db.prepare('UPDATE sip_account SET username = ?, password = ? WHERE id = 1').run(username, password)
    applyBaresipConfig()
    return { ok: true, username, password }
  })
}
