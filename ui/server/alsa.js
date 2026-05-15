import { execFile as _execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFile = promisify(_execFile)
const METER_DIR = process.env.OPENSONIX_METER_DIR ?? '/run/opensonix-meter'
const METER_STALE_MS = 1500
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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
  if (device?.startsWith('opensonix_hifiberry_')) return 'sndrpihifiberry'

  const byNumber = device?.match(/hw:(\d+)/)
  if (byNumber) return byNumber[1]

  const byName = device?.match(/CARD=([^,]+)/)
  return byName ? byName[1] : null
}

async function mixerControls(card) {
  try {
    const { stdout } = await execFile('amixer', ['-c', card, 'scontrols'])
    return [...stdout.matchAll(/'([^']+)'/g)].map(match => match[1])
  } catch {
    return []
  }
}

async function setFirstAvailableControl(card, candidates, percent) {
  const preferred = candidates[0]
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const controls = await mixerControls(card)
    const control = controls.includes(preferred)
      ? preferred
      : (attempt >= 10 ? candidates.slice(1).find(candidate => controls.includes(candidate)) : null)
    if (control) {
      await execFile('amixer', ['-c', card, 'sset', control, `${percent}%`])
      return true
    }
    await sleep(200)
  }
  return false
}

async function playbackControlMidpoint(card, control) {
  try {
    const { stdout } = await execFile('amixer', ['-c', card, 'sget', control])
    const limits = stdout.match(/Limits:\s+Playback\s+(\d+)\s+-\s+(\d+)/)
    if (!limits) return null
    const min = Number.parseInt(limits[1], 10)
    const max = Number.parseInt(limits[2], 10)
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
    return Math.round(min + ((max - min) / 2))
  } catch {
    return null
  }
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
  await setFirstAvailableControl(card, ['OpenSonix Capture', 'Capture', 'ADC', 'Mic', 'Input'], percent)
}

export async function setPlaybackVolume(device, percent) {
  const card = cardFromDevice(device)
  if (!card) return
  await setFirstAvailableControl(card, ['OpenSonix Playback', 'Master', 'PCM', 'Digital', 'Analogue', 'Speaker', 'Headphone'], percent)
}

export async function applyHardwareSafetyDefaults(device) {
  const card = cardFromDevice(device)
  if (!card) return

  const controls = await mixerControls(card)
  const hasOnlyGenericPcm = controls.includes('PCM')
    && !controls.some(control => ['Master', 'Digital', 'Analogue', 'Speaker', 'Headphone'].includes(control))

  // Many generic USB Audio CODEC devices expose only a hardware PCM playback
  // control. At the top of the range it can overdrive the analog loop badly,
  // while the UI now controls OpenSonix's softvol layer. Use a raw midpoint:
  // percentages are driver-dependent here and can map to near-mute levels.
  if (hasOnlyGenericPcm) {
    const midpoint = await playbackControlMidpoint(card, 'PCM')
    await execFile('amixer', ['-c', card, 'sset', 'PCM', `${midpoint ?? 64}`])
  }
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
