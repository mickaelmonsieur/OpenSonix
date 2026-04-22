import { readFile, writeFile } from 'node:fs/promises'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

const DHCPCD_CONF = '/etc/dhcpcd.conf'

// Regex that matches the static block we inject/remove
const STATIC_RE = /\ninterface eth0\n(?:static [^\n]+\n)*/g

export async function readNetworkConfig() {
  let content
  try {
    content = await readFile(DHCPCD_CONF, 'utf8')
  } catch {
    return { mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '', hostname: '' }
  }

  const hostnameMatch = content.match(/^hostname\s+(.+)$/m)
  const hostname      = hostnameMatch ? hostnameMatch[1].trim() : ''

  const staticMatch = content.match(
    /interface eth0\s+static ip_address=([^\s/]+)\/(\d+)\s+static routers=([^\n]+)\s+static domain_name_servers=([^\n]+)/
  )
  if (staticMatch) {
    const [, ip, prefix, gateway, dnsLine] = staticMatch
    const [dns1 = '', dns2 = ''] = dnsLine.trim().split(/\s+/)
    return { mode: 'static', ip, mask: prefixToMask(Number(prefix)), gateway: gateway.trim(), dns1, dns2, hostname }
  }

  return { mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '', hostname }
}

export async function writeNetworkConfig({ mode, ip, mask, gateway, dns1, dns2, hostname }) {
  let content
  try {
    content = await readFile(DHCPCD_CONF, 'utf8')
  } catch {
    content = ''
  }

  // Strip any existing static block
  content = content.replace(STATIC_RE, '')

  // Update/insert hostname directive
  if (hostname) {
    if (/^hostname\s+/m.test(content)) {
      content = content.replace(/^hostname\s+.+$/m, `hostname ${hostname}`)
    } else {
      content = `hostname ${hostname}\n` + content
    }
  }

  if (mode === 'static') {
    const prefix     = maskToPrefix(mask)
    const dnsServers = [dns1, dns2].filter(Boolean).join(' ')
    content +=
      `\ninterface eth0\n` +
      `static ip_address=${ip}/${prefix}\n` +
      `static routers=${gateway}\n` +
      `static domain_name_servers=${dnsServers}\n`
  }

  await writeFile(DHCPCD_CONF, content, 'utf8')

  // Restart dhcpcd asynchronously — IP may change, caller must warn the user
  execFile('systemctl', ['restart', 'dhcpcd'])
    .catch(err => console.error('[network] dhcpcd restart failed:', err.message))
}

// ── helpers ──────────────────────────────────────────────────────────────────

function prefixToMask(prefix) {
  const n = (0xffffffff << (32 - prefix)) >>> 0
  return `${n >>> 24}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`
}

function maskToPrefix(mask) {
  return mask.split('.').reduce((acc, octet) => {
    let n = parseInt(octet, 10), bits = 0
    while (n) { bits += n & 1; n >>>= 1 }
    return acc + bits
  }, 0)
}
