import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

// Parse `aplay -L` / `arecord -L` output.
// Non-indented lines are device identifiers; indented lines are descriptions.
function parseDeviceList(stdout) {
  return stdout.split('\n')
    .filter(line => line.length > 0 && !/^\s/.test(line))
    .map(line => line.trim())
    .filter(Boolean)
}

function cardFromDevice(device) {
  const m = device.match(/hw:(\d+)/)
  return m ? m[1] : '1'
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
  await execFile('amixer', ['-c', card, 'sset', 'Capture', `${percent}%`])
}

export async function setPlaybackVolume(device, percent) {
  const card = cardFromDevice(device)
  await execFile('amixer', ['-c', card, 'sset', 'Master', `${percent}%`])
}

// Ordered lists of controls to try — first match wins.
// Some cards expose live peak meters; others only expose volume settings.
const CAPTURE_CONTROLS  = ['Capture', 'Mic', 'Mic Boost', 'Input']
const PLAYBACK_CONTROLS = ['Master', 'PCM', 'Speaker', 'Headphone']

async function readLevelFromAmixer(card, controls) {
  for (const ctrl of controls) {
    try {
      const { stdout } = await execFile('amixer', ['-c', card, '-M', 'sget', ctrl])
      const m = stdout.match(/\[(\d+)%\]/)
      if (m) return parseInt(m[1], 10) / 100
    } catch {}
  }
  return 0
}

// Returns { tx, rx } in [0, 1].
// On hardware that exposes dynamic peak meters the values reflect actual signal.
// On other hardware they reflect the current volume setting.
export async function getAudioLevels(deviceIn, deviceOut) {
  const cardIn  = cardFromDevice(deviceIn  ?? 'hw:1')
  const cardOut = cardFromDevice(deviceOut ?? 'hw:1')
  const [tx, rx] = await Promise.all([
    readLevelFromAmixer(cardIn,  CAPTURE_CONTROLS),
    readLevelFromAmixer(cardOut, PLAYBACK_CONTROLS),
  ])
  return { tx, rx }
}
