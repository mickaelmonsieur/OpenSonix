import { readFile, writeFile } from 'node:fs/promises'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

const NETWORK_FILE = '/etc/systemd/network/10-eth0.network'
const HOSTNAME_FILE = '/etc/hostname'

export async function readNetworkConfig() {
  let hostname = ''
  try { hostname = (await readFile(HOSTNAME_FILE, 'utf8')).trim() } catch {}

  let content
  try {
    content = await readFile(NETWORK_FILE, 'utf8')
  } catch {
    return { mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '', hostname }
  }

  if (/^\s*DHCP\s*=\s*yes/mi.test(content)) {
    return { mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '', hostname }
  }

  const addrMatch  = content.match(/^\s*Address\s*=\s*([^/\s]+)\/(\d+)/mi)
  const gwMatch    = content.match(/^\s*Gateway\s*=\s*(\S+)/mi)
  const dnsAll     = [...content.matchAll(/^\s*DNS\s*=\s*(\S+)/gmi)]

  return {
    mode:    'static',
    ip:      addrMatch?.[1] ?? '',
    mask:    addrMatch ? prefixToMask(Number(addrMatch[2])) : '',
    gateway: gwMatch?.[1] ?? '',
    dns1:    dnsAll[0]?.[1] ?? '',
    dns2:    dnsAll[1]?.[1] ?? '',
    hostname,
  }
}

export async function writeNetworkConfig({ mode, ip, mask, gateway, dns1, dns2, hostname }) {
  let content
  if (mode === 'static') {
    const prefix   = maskToPrefix(mask)
    const dnsLines = [dns1, dns2].filter(Boolean).map(d => `DNS=${d}`).join('\n')
    content = `[Match]\nName=eth0\n\n[Network]\nAddress=${ip}/${prefix}\nGateway=${gateway}\n${dnsLines}\n`
  } else {
    content = '[Match]\nName=eth0\n\n[Network]\nDHCP=yes\n'
  }

  await writeFile(NETWORK_FILE, content, 'utf8')

  if (hostname) {
    await writeFile(HOSTNAME_FILE, hostname + '\n', 'utf8')
    execFile('hostnamectl', ['set-hostname', hostname]).catch(() => {})
  }

  // Fire-and-forget — IP may change, caller warns the user
  execFile('systemctl', ['restart', 'systemd-networkd'])
    .catch(err => console.error('[network] systemd-networkd restart failed:', err.message))
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
