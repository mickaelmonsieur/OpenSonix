import baresip from './baresip.js'
import db      from './db.js'
import { EventEmitter } from 'node:events'

// Live state updated by baresip events — imported by routes that need it.
export const state = {
  call:         null,   // null | { status: 'incoming'|'ringing'|'established', uri, direction, startedAt? }
  registration: null,   // null | 'ok' | 'fail'
}

export const stateEvents = new EventEmitter()

let callStartedAt = null
let callDirection = 'outbound'   // overridden to 'inbound' on CALL_INCOMING
let syncInFlight = null
let lastSyncAt = 0

const SYNC_MIN_INTERVAL = 1_500

function closeCall({ record = true } = {}) {
  if (callStartedAt && state.call) {
    const endedAt  = new Date().toISOString()
    const duration = Math.round((Date.now() - new Date(callStartedAt).getTime()) / 1000)
    if (record) {
      db.prepare(
        `INSERT INTO call_history (direction, remote_uri, started_at, ended_at, duration)
         VALUES (?, ?, ?, ?, ?)`
      ).run(state.call.direction, state.call.uri, callStartedAt, endedAt, duration)
    }
  }
  callStartedAt = null
  callDirection = 'outbound'
  state.call    = null
}

function setCallFromSync(call) {
  const previous = state.call
  const changed =
    previous?.status    !== call?.status ||
    previous?.uri       !== call?.uri ||
    previous?.direction !== call?.direction ||
    previous?.startedAt !== call?.startedAt

  state.call = call
  callStartedAt = call?.startedAt ?? null
  callDirection = call?.direction ?? 'outbound'

  if (changed) stateEvents.emit('call:sync', call)
}

function scheduleSync(delay = 0) {
  setTimeout(() => {
    syncCallStateFromBaresip({ force: true }).catch(err => {
      console.error('[state] baresip call sync failed:', err.message)
    })
  }, delay)
}

export async function syncCallStateFromBaresip({ force = false } = {}) {
  if (!baresip.connected) return state.call

  const now = Date.now()
  if (!force && now - lastSyncAt < SYNC_MIN_INTERVAL) return state.call
  if (syncInFlight) return syncInFlight

  syncInFlight = (async () => {
    lastSyncAt = Date.now()

    const list = await baresip.send('listcalls')
    const active = parseActiveCall(list.data ?? '')
    if (!active) {
      if (state.call) {
        closeCall()
        stateEvents.emit('call:sync', null)
      }
      return state.call
    }

    let details = {}
    try {
      const callstat = await baresip.send('callstat')
      details = parseCallstat(callstat.data ?? '')
    } catch {}

    const currentStartedAt = state.call?.status === 'established'
      ? state.call.startedAt
      : null
    const startedAt = currentStartedAt
      ?? startedAtFromDuration(active.durationSeconds)
      ?? new Date().toISOString()
    const direction = details.direction ?? state.call?.direction ?? callDirection
    const uri = details.peerUri ?? active.uri ?? state.call?.uri ?? ''

    setCallFromSync({
      status: active.status,
      uri,
      direction,
      startedAt: active.status === 'established' ? startedAt : null,
    })

    return state.call
  })().finally(() => {
    syncInFlight = null
  })

  return syncInFlight
}

function parseActiveCall(data) {
  const line = data.split('\n').find(row => row.includes('[line ') && /\b[A-Z_]+\b/.test(row))
  if (!line) return null

  const match = line.match(/\]\s+([0-9:]+)\s+([A-Z_]+)\s+(.+?)\s*$/)
  if (!match) return null

  return {
    durationSeconds: parseDuration(match[1]),
    status: match[2].toLowerCase(),
    uri: match[3].trim(),
  }
}

function parseCallstat(data) {
  const directionMatch = data.match(/^\s*direction:\s*(Outgoing|Incoming)\s*$/m)
  const peerMatch = data.match(/^\s*peer_uri:\s*<?([^>\s]+)>?\s*$/m)
  return {
    direction: directionMatch
      ? (directionMatch[1] === 'Incoming' ? 'inbound' : 'outbound')
      : null,
    peerUri: peerMatch?.[1] ?? null,
  }
}

function parseDuration(text) {
  const parts = text.split(':').map(part => Number(part))
  if (parts.some(part => !Number.isFinite(part))) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function startedAtFromDuration(seconds) {
  if (!Number.isFinite(seconds)) return null
  return new Date(Date.now() - seconds * 1000).toISOString()
}

baresip.on('CALL_INCOMING', msg => {
  callDirection = 'inbound'
  state.call    = { status: 'incoming', uri: msg.peeruri ?? '', direction: 'inbound' }
})

baresip.on('CALL_RINGING', () => {
  if (state.call) state.call.status = 'ringing'
})

baresip.on('CALL_ESTABLISHED', msg => {
  callStartedAt  = new Date().toISOString()
  const uri      = msg.peeruri ?? state.call?.uri ?? ''
  state.call     = { status: 'established', uri, direction: callDirection, startedAt: callStartedAt }
})

baresip.on('CALL_CLOSED', () => closeCall())
baresip.on('disconnected', () => closeCall({ record: false }))

baresip.on('REGISTER_OK',   () => { state.registration = 'ok' })
baresip.on('REGISTER_FAIL', () => { state.registration = 'fail' })

// ctrl_tcp does not replay CALL_ESTABLISHED for a call that already exists
// when the UI backend connects. Reconcile once after connect/startup so the UI
// does not get stuck on "inactive" while baresip is already in-call.
baresip.on('connected', () => scheduleSync(500))
setTimeout(() => {
  if (baresip.connected) scheduleSync()
}, 1_500)
