import { execFile as _execFile } from 'node:child_process'
import { readFile }              from 'node:fs/promises'
import { promisify }             from 'node:util'
import { randomBytes }           from 'node:crypto'
import os                        from 'node:os'
import bcrypt                    from 'bcryptjs'
import db                        from '../db.js'
import { writeNetworkConfig }    from '../network.js'
import { authenticate, requirePasswordChanged } from '../auth.js'

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
      const { stdout, stderr } = await execFile(cmd, args)
      return (stdout + stderr).trim()
    } catch (e) {
      return e.stdout?.trim() || e.stderr?.trim() || `[error: ${e.message}]`
    }
  }

  const section = (title, content) =>
    `### ${title}\n\`\`\`\n${content || '(empty)'}\n\`\`\``

  const fw      = await readText('/etc/opensonix-release')
  const osRel   = await readText('/etc/os-release')
  const cpuinfo = await readText('/proc/cpuinfo')

  const [uname, freeMem, uptime, lsblk, dpkgList] = await Promise.all([
    run('uname',  ['-a']),
    run('free',   ['-m']),
    run('uptime', []),
    run('lsblk',  ['-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT']),
    run('dpkg',   ['-l']),
  ])

  const lines = [
    `## OpenSonix — Rapport de diagnostic`,
    `Généré le : ${new Date().toISOString()}`,
    `Firmware   : ${fw ?? 'dev'}`,
    '',
    section('uname -a',        uname),
    section('uptime',          uptime),
    section('free -m',         freeMem),
    section('/etc/os-release', osRel),
    section('/proc/cpuinfo',   cpuinfo),
    section('lsblk',           lsblk),
    section('dpkg -l',         dpkgList),
  ]

  return lines.join('\n\n')
}

export default async function systemRoutes(fastify) {
  fastify.addHook('preHandler', authenticate)
  fastify.addHook('preHandler', requirePasswordChanged)

  // GET /api/system/info
  fastify.get('/info', async () => getSystemInfo())

  // GET /api/system/report — full diagnostic dump for GitHub issues
  fastify.get('/report', async () => ({ report: await buildReport() }))

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
