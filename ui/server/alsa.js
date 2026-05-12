import { execFile as _execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFile = promisify(_execFile)
const METER_DIR = process.env.OPENSONIX_METER_DIR ?? '/run/opensonix-meter'
const METER_STALE_MS = 1500

// Parse `aplay -L` / `arecord -L` output.
// Non-indented lines are device identifiers; indented lines are descriptions.
function parseDeviceList(stdout) {
  return stdout.split('\n')
    .filter(line => line.length > 0 && !/^\s/.test(line))
    .map(line => line.trim())
    .filter(device => !device.startsWith('opensonix_meter_'))
    .filter(Boolean)
}

function cardFromDevice(device) {
  const byNumber = device?.match(/hw:(\d+)/)
  if (byNumber) return byNumber[1]

  const byName = device?.match(/CARD=([^,]+)/)
  return byName ? byName[1] : null
}

export async function listPlaybackDevices() {
  try {
    const { stdout } = await execFile('aplay', ['-L'])
    return parseDeviceList(stdout)
  } catch {
    return []
  }
}

export async function listCaptureDevices() {
  try {
    const { stdout } = await execFile('arecord', ['-L'])
    return parseDeviceList(stdout)
  } catch {
    return []
  }
}

export async function setCaptureVolume(device, percent) {
  const card = cardFromDevice(device)
  if (!card) return
  await execFile('amixer', ['-c', card, 'sset', 'Capture', `${percent}%`])
}

export async function setPlaybackVolume(device, percent) {
  const card = cardFromDevice(device)
  if (!card) return
  await execFile('amixer', ['-c', card, 'sset', 'Master', `${percent}%`])
}

async function readMeter(direction) {
  try {
    const payload = JSON.parse(await readFile(join(METER_DIR, `${direction}.json`), 'utf8'))
    if (!payload.updatedAt || Date.now() - payload.updatedAt > METER_STALE_MS) return 0
    return Math.max(payload.left ?? 0, payload.right ?? 0)
  } catch {
    return 0
  }
}

// Returns { tx, rx } in [0, 1]. Values come from the ALSA file-plugin taps
// configured around the actual baresip source/player PCMs.
export async function getAudioLevels(deviceIn, deviceOut) {
  const [tx, rx] = await Promise.all([readMeter('tx'), readMeter('rx')])
  return { tx, rx }
}
