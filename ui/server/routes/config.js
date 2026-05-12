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
const HIFIBERRY_RE     = /hifiberry|sndrpihifiberry|dacplus|dac|adc/i

const genToken = () => randomBytes(16).toString('hex')

const ALLOWED_KEYS = new Set([
  'mode',
  'audio_device_in', 'audio_device_out',
  'capture_volume',  'playback_volume',
  'opus_bitrate',    'opus_stereo', 'opus_fec',
  'sip_port',
  'login_max_attempts', 'login_window_minutes', 'password_min_length',
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
    `audio_alert      alsa,null`,
    `audio_samplerate 48000`,
    `audio_channels   2`,
    ``,
    `opus_bitrate     ${cfg.opus_bitrate}`,
    `opus_stereo      ${cfg.opus_stereo === 'true' ? 'yes' : 'no'}`,
    `opus_inbandFEC   ${cfg.opus_fec    === 'true' ? 'yes' : 'no'}`,
    ``,
    `module_path      /usr/lib/baresip/modules`,
    `module           ctrl_tcp.so`,
    `module           menu.so`,
    `module           opus.so`,
    `module           alsa.so`,
    `module           account.so`,
    ``,
    `ctrl_tcp_listen  127.0.0.1:4444`,
    `sip_listen       0.0.0.0:${cfg.sip_port}`,
  ].join('\n') + '\n'
}

function renderBaresipAccounts(cfg, sip) {
  // Both modes use a local identity only. OpenSonix devices call each other
  // directly; a receiver is not a SIP registrar, so the sender must not
  // REGISTER against the remote host.
  return `<sip:${sip.username}@0.0.0.0:${cfg.sip_port}>;regint=0;\n`
}

export async function applyBaresipConfig() {
  const cfg = cfgMap()
  const sip = getSip()
  try {
    await resolveAudioDevices(cfg)
    await Promise.all([
      writeFile(BARESIP_CONF,     renderBaresipConf(cfg)),
      writeFile(BARESIP_ACCOUNTS, renderBaresipAccounts(cfg, sip)),
    ])
    await execFile('sudo', ['systemctl', 'restart', 'baresip'])
  } catch (err) {
    console.error('[config] baresip restart skipped:', err.message)
  }
}

async function resolveAudioDevices(cfg) {
  const [playback, capture] = await Promise.all([listPlaybackDevices(), listCaptureDevices()])
  const audioOut = pickAudioDevice(cfg.audio_device_out, playback, 'playback')
  const audioIn  = pickAudioDevice(cfg.audio_device_in,  capture,  'capture')

  if (audioOut && audioOut !== cfg.audio_device_out) {
    cfg.audio_device_out = audioOut
    db.prepare('UPDATE config SET value = ? WHERE key = ?').run(audioOut, 'audio_device_out')
  }
  if (audioIn && audioIn !== cfg.audio_device_in) {
    cfg.audio_device_in = audioIn
    db.prepare('UPDATE config SET value = ? WHERE key = ?').run(audioIn, 'audio_device_in')
  }
}

function pickAudioDevice(current, devices, kind) {
  const opensonixHiFiBerry = kind === 'capture'
    ? 'opensonix_hifiberry_cap'
    : 'opensonix_hifiberry_play'
  if (
    devices.includes(opensonixHiFiBerry) &&
    (!current || current === 'null' || HIFIBERRY_RE.test(current))
  ) {
    return opensonixHiFiBerry
  }

  if (current && current !== 'null' && devices.includes(current)) return current

  const hifiberry = pickMatchingDevice(devices, HIFIBERRY_RE)
  if (hifiberry) return hifiberry

  const preferred = kind === 'capture'
    ? ['default:CARD=CODEC', 'plughw:CARD=CODEC,DEV=0', 'hw:CARD=CODEC,DEV=0', 'null']
    : [
        'default:CARD=CODEC', 'plughw:CARD=CODEC,DEV=0', 'hw:CARD=CODEC,DEV=0',
        'default:CARD=Headphones', 'plughw:CARD=Headphones,DEV=0',
        'default:CARD=vc4hdmi', 'plughw:CARD=vc4hdmi,DEV=0', 'null',
      ]

  return preferred.find(device => devices.includes(device))
    ?? devices.find(device => device !== 'null')
    ?? devices[0]
    ?? current
}

function pickMatchingDevice(devices, pattern) {
  return devices.find(device => device !== 'null' && device.startsWith('default:') && pattern.test(device))
    ?? devices.find(device => device !== 'null' && device.startsWith('plughw:') && pattern.test(device))
    ?? devices.find(device => device !== 'null' && pattern.test(device))
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
