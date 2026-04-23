import baresip   from './baresip.js'
import db         from './db.js'
import { state }  from './state.js'

// Auto-reconnect watchdog for SENDER mode.
// When the link drops unexpectedly, redials with exponential backoff.
// Dormant in RECEIVER mode (buildDialUri returns null).

const REDIAL_INITIAL = 5_000    // ms before first retry
const REDIAL_MAX     = 60_000   // ms ceiling

let retryTimer   = null
let retryDelay   = REDIAL_INITIAL
let manualHangup = false
let dialing      = false

function cfg(key) {
  return db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value
}

function buildDialUri() {
  if (cfg('mode') !== 'SENDER') return null
  const sip = db.prepare('SELECT registrar, remote_user FROM sip_account WHERE id = 1').get()
  if (!sip?.registrar || !sip?.remote_user) return null
  const port = cfg('sip_port') ?? '7060'
  return `sip:${sip.remote_user}@${sip.registrar}:${port}`
}

function cancelRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
}

async function dial(uri) {
  if (!baresip.connected || state.call || dialing) return
  dialing = true
  try {
    await baresip.send('dial', uri)
    retryDelay = REDIAL_INITIAL
  } catch {
    scheduleRedial()
  } finally {
    dialing = false
  }
}

function scheduleRedial() {
  if (retryTimer || manualHangup) return
  const uri = buildDialUri()
  if (!uri) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (!manualHangup) dial(uri)
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, REDIAL_MAX)
}

// Registration success → auto-dial (covers boot and baresip restart)
baresip.on('REGISTER_OK', () => {
  if (manualHangup || state.call) return
  const uri = buildDialUri()
  if (uri) dial(uri)
})

// Call up → reset backoff for next drop
baresip.on('CALL_ESTABLISHED', () => {
  retryDelay = REDIAL_INITIAL
  cancelRetry()
})

// Call dropped → redial unless user hung up manually
baresip.on('CALL_CLOSED', () => {
  dialing = false
  if (manualHangup) { manualHangup = false; return }
  scheduleRedial()
})

// Called by the /api/call/hangup route — suppresses auto-redial
export function notifyManualHangup() {
  manualHangup = true
  cancelRetry()
}

// Called by the /api/call/dial route — re-arms the watchdog
export function notifyManualDial() {
  manualHangup = false
  retryDelay   = REDIAL_INITIAL
  cancelRetry()
}
