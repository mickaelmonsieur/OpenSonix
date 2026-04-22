import { createConnection } from 'node:net'
import { EventEmitter }    from 'node:events'
import { randomBytes }     from 'node:crypto'

const HOST          = '127.0.0.1'
const PORT          = 4444
const RECONNECT_MIN = 1_000   // ms — first retry delay
const RECONNECT_MAX = 30_000  // ms — ceiling for exponential backoff
const CMD_TIMEOUT   = 10_000  // ms — per-command response timeout

export class BaresipClient extends EventEmitter {
  // Emitted events:
  //   'connected'    — TCP link up
  //   'disconnected' — TCP link lost
  //   'event'        — any baresip unsolicited event (full object)
  //   msg.type       — e.g. 'CALL_ESTABLISHED', 'REGISTER_OK', …

  #socket         = null
  #buffer         = ''
  #pending        = new Map()   // token → { resolve, reject, timer }
  #reconnectDelay = RECONNECT_MIN
  #connected      = false
  #destroyed      = false

  constructor() {
    super()
    this.#connect()
  }

  get connected() { return this.#connected }

  // Send a command to baresip. Returns a Promise that resolves with the
  // response object, or rejects on error / timeout / disconnect.
  send(command, params) {
    return new Promise((resolve, reject) => {
      if (!this.#connected) {
        return reject(new Error('baresip not connected'))
      }

      const token = randomBytes(4).toString('hex')
      const timer = setTimeout(() => {
        this.#pending.delete(token)
        reject(new Error(`baresip command "${command}" timed out`))
      }, CMD_TIMEOUT)

      this.#pending.set(token, { resolve, reject, timer })

      const payload = params !== undefined
        ? { command, params, token }
        : { command, token }

      this.#socket.write(JSON.stringify(payload) + '\n')
    })
  }

  // Tear down permanently (called on process exit).
  destroy() {
    this.#destroyed = true
    this.#socket?.destroy()
    this.#rejectAllPending('baresip client destroyed')
  }

  // ── private ─────────────────────────────────────────────────────────────

  #connect() {
    if (this.#destroyed) return

    const socket = createConnection({ host: HOST, port: PORT })
    this.#socket = socket
    socket.setEncoding('utf8')

    socket.on('connect', () => {
      this.#connected      = true
      this.#reconnectDelay = RECONNECT_MIN
      this.#buffer         = ''
      this.emit('connected')
    })

    socket.on('data', (chunk) => {
      this.#buffer += chunk
      const lines  = this.#buffer.split('\n')
      this.#buffer = lines.pop()            // keep any incomplete trailing fragment
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) this.#handleMessage(trimmed)
      }
    })

    socket.on('error', (err) => {
      // 'close' fires right after — that's where we reconnect.
      // Suppress the very common ECONNREFUSED noise during startup.
      if (err.code !== 'ECONNREFUSED') {
        console.error('[baresip] socket error:', err.message)
      }
    })

    socket.on('close', () => {
      if (this.#connected) {
        this.#connected = false
        this.emit('disconnected')
      }
      this.#rejectAllPending('baresip connection closed')
      this.#scheduleReconnect()
    })
  }

  #handleMessage(line) {
    let msg
    try { msg = JSON.parse(line) } catch { return }

    if (msg.response === true) {
      const entry = this.#pending.get(msg.token)
      if (!entry) return
      clearTimeout(entry.timer)
      this.#pending.delete(msg.token)
      if (msg.ok) {
        entry.resolve(msg)
      } else {
        entry.reject(new Error(msg.data ?? 'baresip command failed'))
      }

    } else if (msg.event === true) {
      this.emit('event', msg)
      if (msg.type) this.emit(msg.type, msg)
    }
  }

  #rejectAllPending(reason) {
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer)
      reject(new Error(reason))
    }
    this.#pending.clear()
  }

  #scheduleReconnect() {
    if (this.#destroyed) return
    setTimeout(() => this.#connect(), this.#reconnectDelay)
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, RECONNECT_MAX)
  }
}

// Singleton — one connection per process.
export default new BaresipClient()
