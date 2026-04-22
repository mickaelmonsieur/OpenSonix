import baresip from './baresip.js'
import db      from './db.js'

// Live state updated by baresip events — imported by routes that need it.
export const state = {
  call:         null,   // null | { status: 'incoming'|'ringing'|'established', uri, direction }
  registration: null,   // null | 'ok' | 'fail'
}

let callStartedAt = null
let callDirection = 'outbound'   // overridden to 'inbound' on CALL_INCOMING

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
  state.call     = { status: 'established', uri, direction: callDirection }
})

baresip.on('CALL_CLOSED', () => {
  if (callStartedAt && state.call) {
    const endedAt  = new Date().toISOString()
    const duration = Math.round((Date.now() - new Date(callStartedAt).getTime()) / 1000)
    db.prepare(
      `INSERT INTO call_history (direction, remote_uri, started_at, ended_at, duration)
       VALUES (?, ?, ?, ?, ?)`
    ).run(state.call.direction, state.call.uri, callStartedAt, endedAt, duration)
  }
  callStartedAt = null
  callDirection = 'outbound'
  state.call    = null
})

baresip.on('REGISTER_OK',   () => { state.registration = 'ok' })
baresip.on('REGISTER_FAIL', () => { state.registration = 'fail' })
