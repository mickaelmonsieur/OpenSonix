import { execFile as _execFile }              from 'node:child_process'
import { readFile, writeFile }               from 'node:fs/promises'
import { promisify }                         from 'node:util'
import { randomBytes }                       from 'node:crypto'
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import os                                    from 'node:os'
import bcrypt                                from 'bcryptjs'
import db                                    from '../db.js'
import { writeNetworkConfig }                from '../network.js'
import { authenticate, requirePasswordChanged } from '../auth.js'
import { applyBaresipConfig }               from './config.js'

// Magic header identifying a valid .osonix backup file (4 bytes: "OSX\x01")
const MAGIC = Buffer.from([0x4f, 0x53, 0x58, 0x01])

const execFile = promisify(_execFile)
const genToken = () => randomBytes(16).toString('hex')

const DEFAULT_CONFIG = [
  ['mode',            'RECEIVER'],
  ['audio_device_in', 'hw:1,0'],
  ['audio_device_out','hw:1,0'],
  ['capture_volume',  '80'],
  ['playback_volume', '80'],
  ['opus_bitrate',    '128000'],
  ['opus_stereo',     'true'],
  ['opus_fec',        'true'],
  ['sip_port',        '7060'],
]

// ── helpers ──────────────────────────────────────────────────────────────────

async function readText(path) {
  try { return (await readFile(path, 'utf8')).trim() } catch { return null }
}

async function dpkgVersion(pkg) {
  try {
    const { stdout } = await execFile('dpkg-query', ['-W', `-f=\${Version}`, pkg])
    return stdout.trim() || null
  } catch { return null }
}

async function getSystemInfo() {
  const [load1, load5, load15] = os.loadavg()
  const totalMem = os.totalmem()
  const freeMem  = os.freemem()

  // Network: prefer eth0 then wlan0
  let netIface = null, netState = null, netSpeed = null
  for (const iface of ['eth0', 'wlan0']) {
    const state = await readText(`/sys/class/net/${iface}/operstate`)
    if (state) {
      netIface = iface
      netState = state
      const s = parseInt(await readText(`/sys/class/net/${iface}/speed`) ?? '', 10)
      if (s > 0) netSpeed = s
      break
    }
  }

  // OS pretty name from /etc/os-release
  let osName = null
  const osRelease = await readText('/etc/os-release')
  if (osRelease) {
    const m = osRelease.match(/^PRETTY_NAME="(.+)"$/m)
    if (m) osName = m[1]
  }

  // Firmware version written at image build time
  const fwVersion = await readText('/etc/opensonix-release')

  // Software versions (parallel dpkg queries)
  const [baresipVersion, libopusVersion, alsaVersion] = await Promise.all([
    dpkgVersion('baresip'),
    dpkgVersion('libopus0'),
    dpkgVersion('alsa-utils'),
  ])

  return {
    uptime:  os.uptime(),
    load:    { m1: load1, m5: load5, m15: load15 },
    cpus:    os.cpus().length,
    memory:  { total: totalMem, free: freeMem },
    network: { iface: netIface, state: netState, speed: netSpeed },
    datetime: new Date().toISOString(),
    osName,
    versions: {
      firmware:  fwVersion ?? 'dev',
      kernel:    os.release(),
      node:      process.version,
      baresip:   baresipVersion,
      libopus:   libopusVersion,
      alsa:      alsaVersion,
    },
  }
}

async function buildReport() {
  const run = async (cmd, args) => {
    try {
      const { stdout, stderr } = await execFile(cmd, args, { timeout: 10000 })
      return (stdout + stderr).trim()
    } catch (e) {
      return e.stdout?.trim() || e.stderr?.trim() || `[erreur: ${e.message}]`
    }
  }

  const sec = (title, content) =>
    `### ${title}\n\`\`\`\n${content || '(vide)'}\n\`\`\``

  // Reads
  const [fw, osRel, cpuinfo, asoundCards, meminfo] = await Promise.all([
    readText('/etc/opensonix-release'),
    readText('/etc/os-release'),
    readText('/proc/cpuinfo'),
    readText('/proc/asound/cards'),
    readText('/proc/meminfo'),
  ])

  // OpenSonix config from DB (no passwords)
  let opensonixCfg = ''
  try {
    const rows = db.prepare('SELECT key, value FROM config').all()
    opensonixCfg = rows.map(r => `${r.key} = ${r.value}`).join('\n')
    const sip = db.prepare('SELECT username, registrar, remote_user FROM sip_account WHERE id = 1').get()
    if (sip) {
      opensonixCfg += `\nsip_username = ${sip.username ?? '—'}`
      opensonixCfg += `\nsip_registrar = ${sip.registrar ?? '—'}`
      opensonixCfg += `\nsip_remote_user = ${sip.remote_user ?? '—'}`
    }
  } catch {}

  // Commands — run in parallel by group to keep total time reasonable
  const [
    uname, uptimeOut, hostname,
    ipAddr, ipRoute, ipStats, ssOut,
    freeOut, dfOut, lsblkOut,
    aplayOut, arecordOut, amixerOut,
    psOut,
    baresipStatus, uiStatus,
    baresipLog, uiLog, dmesgOut,
    dpkgList,
    vcTemp, vcThrottle,
  ] = await Promise.all([
    // system
    run('uname',    ['-a']),
    run('uptime',   []),
    run('hostname', ['-f']),
    // network
    run('ip', ['addr']),
    run('ip', ['route']),
    run('ip', ['-s', 'link']),
    run('ss', ['-tuln']),
    // memory / storage
    run('free',  ['-m']),
    run('df',    ['-h']),
    run('lsblk', ['-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT']),
    // audio
    run('aplay',   ['-l']),
    run('arecord', ['-l']),
    run('amixer',  []),
    // processes
    run('ps', ['aux']),
    // services
    run('systemctl', ['status', 'baresip',        '--no-pager', '-l']),
    run('systemctl', ['status', 'opensonix-ui',   '--no-pager', '-l']),
    // logs
    run('journalctl', ['-n', '100', '-u', 'baresip',       '--no-pager']),
    run('journalctl', ['-n', '100', '-u', 'opensonix-ui',  '--no-pager']),
    run('sh', ['-c', 'dmesg | tail -50']),
    // packages
    run('dpkg', ['-l']),
    // Raspberry Pi specific (fails gracefully on non-Pi)
    run('vcgencmd', ['measure_temp']),
    run('vcgencmd', ['get_throttled']),
  ])

  return [
    `## OpenSonix — Rapport de diagnostic`,
    `Généré le : ${new Date().toISOString()}`,
    `Firmware   : ${fw ?? 'dev'}`,
    `Hostname   : ${hostname}`,
    '',
    `---`,
    `## Système`,
    sec('uname -a',          uname),
    sec('uptime',            uptimeOut),
    sec('/etc/os-release',   osRel),
    sec('/proc/cpuinfo',     cpuinfo),
    sec('vcgencmd measure_temp',  vcTemp),
    sec('vcgencmd get_throttled', vcThrottle),
    '',
    `## Mémoire / Stockage`,
    sec('free -m',           freeOut),
    sec('/proc/meminfo',     meminfo),
    sec('df -h',             dfOut),
    sec('lsblk',             lsblkOut),
    '',
    `## Réseau`,
    sec('ip addr',           ipAddr),
    sec('ip route',          ipRoute),
    sec('ip -s link (trafic)', ipStats),
    sec('ss -tuln (ports)',  ssOut),
    '',
    `## Audio / ALSA`,
    sec('/proc/asound/cards', asoundCards),
    sec('aplay -l',          aplayOut),
    sec('arecord -l',        arecordOut),
    sec('amixer',            amixerOut),
    '',
    `## Processus`,
    sec('ps aux',            psOut),
    '',
    `## Services`,
    sec('systemctl status baresip',       baresipStatus),
    sec('systemctl status opensonix-ui',  uiStatus),
    '',
    `## Logs`,
    sec('journalctl baresip (100 dernières lignes)',      baresipLog),
    sec('journalctl opensonix-ui (100 dernières lignes)', uiLog),
    sec('dmesg (50 dernières lignes)',                    dmesgOut),
    '',
    `## Configuration OpenSonix`,
    sec('config',            opensonixCfg),
    '',
    `## Paquets installés`,
    sec('dpkg -l',           dpkgList),
  ].join('\n\n')
}

// ── NTP / Timezone helpers ────────────────────────────────────────────────────

const CHRONY_CONF = '/etc/chrony/chrony.conf'

async function writeChronyCfg(server1, server2) {
  const content = [
    '# Generated by OpenSonix — managed via web UI',
    `server ${server1} iburst`,
    `server ${server2} iburst`,
    '',
    'makestep 1.0 3',
    'driftfile /var/lib/chrony/chrony.drift',
    'rtcsync',
  ].join('\n') + '\n'
  await writeFile(CHRONY_CONF, content)
}

// ── Routes ────────────────────────────────────────────────────────────────────

export default async function systemRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  // GET /api/system/info
  fastify.get('/info', async () => getSystemInfo())

  // GET /api/system/report — full diagnostic dump for GitHub issues
  fastify.get('/report', async () => ({ report: await buildReport() }))

  // GET /api/system/timezones — full IANA list from the system
  fastify.get('/timezones', async () => {
    const { stdout } = await execFile('timedatectl', ['list-timezones'])
    return { timezones: stdout.trim().split('\n') }
  })

  // GET /api/system/clock — current timezone + NTP servers
  fastify.get('/clock', async () => {
    const get = key => db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value
    return {
      timezone:     get('timezone')     ?? 'Europe/Paris',
      ntp_server_1: get('ntp_server_1') ?? '0.europe.pool.ntp.org',
      ntp_server_2: get('ntp_server_2') ?? '1.europe.pool.ntp.org',
    }
  })

  // POST /api/system/timezone  { timezone }
  fastify.post('/timezone', {
    schema: {
      body: {
        type: 'object',
        required: ['timezone'],
        properties: { timezone: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { timezone } = req.body
    try {
      await execFile('timedatectl', ['set-timezone', timezone])
    } catch {
      return reply.code(400).send({ error: `Fuseau horaire invalide : ${timezone}` })
    }
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('timezone', timezone)
    return { ok: true }
  })

  // POST /api/system/ntp  { server1, server2 }
  fastify.post('/ntp', {
    schema: {
      body: {
        type: 'object',
        required: ['server1', 'server2'],
        properties: {
          server1: { type: 'string', minLength: 1 },
          server2: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { server1, server2 } = req.body
    try {
      await writeChronyCfg(server1, server2)
      await execFile('systemctl', ['restart', 'chrony'])
    } catch (err) {
      return reply.code(500).send({ error: `Erreur NTP : ${err.message}` })
    }
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('ntp_server_1', server1)
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('ntp_server_2', server2)
    return { ok: true }
  })

  // ── Backup / Restore ─────────────────────────────────────────────────────────

  // GET /api/system/backup → brotli-compressed binary .osonix file
  fastify.get('/backup', async (req, reply) => {
    const configRows = db.prepare('SELECT key, value FROM config').all()
    const config     = Object.fromEntries(configRows.map(r => [r.key, r.value]))
    const sip        = db.prepare(
      'SELECT username, password, registrar, remote_user, remote_password FROM sip_account WHERE id = 1'
    ).get() ?? {}

    const json = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), config, sip_account: sip })
    const compressed = brotliCompressSync(Buffer.from(json, 'utf8'))
    const file       = Buffer.concat([MAGIC, compressed])

    const dateStr = new Date().toISOString().slice(0, 10)
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="opensonix-${dateStr}.osonix"`)
      .send(file)
  })

  // POST /api/system/restore — upload a .osonix binary and apply it
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body)
  })

  fastify.post('/restore', async (req, reply) => {
    const buf = req.body
    if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
      return reply.code(400).send({ error: 'Invalid backup file' })
    }

    let payload
    try {
      const decompressed = brotliDecompressSync(buf.subarray(MAGIC.length))
      payload = JSON.parse(decompressed.toString('utf8'))
    } catch {
      return reply.code(400).send({ error: 'Corrupted backup file' })
    }

    if (payload.version !== 1 || typeof payload.config !== 'object' || typeof payload.sip_account !== 'object') {
      return reply.code(400).send({ error: 'Invalid backup format' })
    }

    // Only restore keys that exist in the DB (prevents injection of unknown keys)
    const existingKeys = new Set(db.prepare('SELECT key FROM config').all().map(r => r.key))
    const upsert       = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
    db.transaction(() => {
      for (const [key, value] of Object.entries(payload.config)) {
        if (existingKeys.has(key)) upsert.run(key, String(value))
      }
    })()

    const sip = payload.sip_account
    db.prepare(
      'UPDATE sip_account SET username = ?, password = ?, registrar = ?, remote_user = ?, remote_password = ? WHERE id = 1'
    ).run(
      sip.username        ?? null,
      sip.password        ?? null,
      sip.registrar       ?? null,
      sip.remote_user     ?? null,
      sip.remote_password ?? null,
    )

    await applyBaresipConfig()
    return { ok: true }
  })

  // POST /api/system/reboot
  fastify.post('/reboot', async () => {
    execFile('systemctl', ['reboot']).catch(() => {})
    return { ok: true }
  })

  // POST /api/system/factory-reset
  // Resets config, credentials, admin password, network → DHCP, then reboots.
  fastify.post('/factory-reset', async () => {
    // 1. Reset all config keys to factory defaults
    const upsert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
    db.transaction(() => {
      for (const [key, value] of DEFAULT_CONFIG) upsert.run(key, value)
    })()

    // 2. Reset admin password + force change on next login
    const hash = await bcrypt.hash('opensonix', 10)
    db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE username = ?')
      .run(hash, 'admin')

    // 3. Regenerate SIP credentials and clear remote pairing
    db.prepare(
      'UPDATE sip_account SET username = ?, password = ?, registrar = NULL, remote_user = NULL, remote_password = NULL WHERE id = 1'
    ).run(genToken(), genToken())

    // 4. Reset network to DHCP
    try {
      await writeNetworkConfig({
        mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '',
        hostname: 'opensonix',
      })
    } catch (err) {
      console.error('[system] dhcpcd reset skipped:', err.message)
    }

    // 5. Reboot (fire-and-forget — response is sent before the machine goes down)
    execFile('systemctl', ['reboot']).catch(() => {})
    return { ok: true }
  })
}
