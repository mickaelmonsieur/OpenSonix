import { execFile as _execFile } from 'node:child_process'
import { promisify }             from 'node:util'

const execFile = promisify(_execFile)

const LINK_LED_GPIO = Number.parseInt(process.env.OPENSONIX_LINK_LED_GPIO ?? '4', 10)
const DISABLED = process.env.OPENSONIX_LINK_LED_GPIO === 'disabled'
  || process.env.OPENSONIX_LINK_LED_GPIO === 'off'
  || !Number.isFinite(LINK_LED_GPIO)

let currentState = null
let warned = false
let queue = Promise.resolve()

export function setLinkLed(on) {
  if (DISABLED) return queue

  const nextState = Boolean(on)
  if (currentState === nextState) return queue
  currentState = nextState

  queue = queue
    .catch(() => {})
    .then(() => writeLinkLed(nextState))

  return queue
}

async function writeLinkLed(on) {
  const level = on ? 'dh' : 'dl'
  const commands = [
    ['sudo', ['pinctrl', 'set', String(LINK_LED_GPIO), 'op', level]],
    ['sudo', ['raspi-gpio', 'set', String(LINK_LED_GPIO), 'op', level]],
  ]

  for (const [command, args] of commands) {
    try {
      await execFile(command, args, { timeout: 2_000 })
      return
    } catch {}
  }

  if (!warned) {
    warned = true
    console.warn(`[gpio] cannot control link LED on GPIO ${LINK_LED_GPIO}`)
  }
}
