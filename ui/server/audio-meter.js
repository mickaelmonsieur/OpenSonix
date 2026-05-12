#!/usr/bin/env node
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const direction = process.argv[2] === 'rx' ? 'rx' : 'tx'
const sampleFormat = (process.argv[3] ?? 'S16_LE').toUpperCase()
const channels = Math.max(1, Number.parseInt(process.argv[4] ?? '2', 10) || 2)
const runtimeDir = process.env.OPENSONIX_METER_DIR ?? '/run/opensonix-meter'
const outputPath = join(runtimeDir, `${direction}.json`)

const sample = sampleReader(sampleFormat)
const FRAME_BYTES = sample.bytes * channels
const FLUSH_MS = 100

let pending = Buffer.alloc(0)
let peakL = 0
let peakR = 0
let sumSqL = 0
let sumSqR = 0
let frames = 0
let lastFlush = 0

process.stdin.on('data', chunk => {
  const data = pending.length ? Buffer.concat([pending, chunk]) : chunk
  const usable = data.length - (data.length % FRAME_BYTES)
  pending = usable < data.length ? data.subarray(usable) : Buffer.alloc(0)

  for (let offset = 0; offset < usable; offset += FRAME_BYTES) {
    const left = sample.read(data, offset)
    const right = channels > 1 ? sample.read(data, offset + sample.bytes) : left
    if (left > peakL) peakL = left
    if (right > peakR) peakR = right
    sumSqL += left * left
    sumSqR += right * right
    frames += 1
  }

  const now = Date.now()
  if (now - lastFlush >= FLUSH_MS) {
    lastFlush = now
    flush().catch(() => {})
  }
})

process.stdin.on('end', () => {
  flush(true).finally(() => process.exit(0))
})

process.stdin.resume()

async function flush(final = false) {
  if (!frames && !final) return

  const payload = {
    direction,
    left: frames ? peakL : 0,
    right: frames ? peakR : 0,
    rmsLeft: frames ? Math.sqrt(sumSqL / frames) : 0,
    rmsRight: frames ? Math.sqrt(sumSqR / frames) : 0,
    format: sampleFormat,
    channels,
    updatedAt: Date.now(),
  }

  peakL = 0
  peakR = 0
  sumSqL = 0
  sumSqR = 0
  frames = 0

  await mkdir(dirname(outputPath), { recursive: true })
  const tmp = `${outputPath}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(payload), { mode: 0o644 })
  await rename(tmp, outputPath)
}

function sampleReader(format) {
  switch (format) {
    case 'S16_BE':
      return { bytes: 2, read: (buf, offset) => Math.abs(buf.readInt16BE(offset)) / 32768 }
    case 'S24_LE':
      return { bytes: 4, read: (buf, offset) => Math.abs(buf.readInt32LE(offset) >> 8) / 8388608 }
    case 'S24_BE':
      return { bytes: 4, read: (buf, offset) => Math.abs(buf.readInt32BE(offset) >> 8) / 8388608 }
    case 'S24_3LE':
      return { bytes: 3, read: readS24_3LE }
    case 'S24_3BE':
      return { bytes: 3, read: readS24_3BE }
    case 'S32_LE':
      return { bytes: 4, read: (buf, offset) => Math.abs(buf.readInt32LE(offset)) / 2147483648 }
    case 'S32_BE':
      return { bytes: 4, read: (buf, offset) => Math.abs(buf.readInt32BE(offset)) / 2147483648 }
    case 'FLOAT_LE':
      return { bytes: 4, read: (buf, offset) => clamp01(Math.abs(buf.readFloatLE(offset))) }
    case 'FLOAT_BE':
      return { bytes: 4, read: (buf, offset) => clamp01(Math.abs(buf.readFloatBE(offset))) }
    case 'S16_LE':
    default:
      return { bytes: 2, read: (buf, offset) => Math.abs(buf.readInt16LE(offset)) / 32768 }
  }
}

function readS24_3LE(buf, offset) {
  let value = buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16)
  if (value & 0x800000) value |= 0xff000000
  return Math.abs(value) / 8388608
}

function readS24_3BE(buf, offset) {
  let value = (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2]
  if (value & 0x800000) value |= 0xff000000
  return Math.abs(value) / 8388608
}

function clamp01(value) {
  return Math.min(1, value)
}
