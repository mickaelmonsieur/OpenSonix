import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SYSTEM_USER = 'opensonix'
const SSHD_CONFIG = '/etc/ssh/sshd_config.d/99-opensonix.conf'

function renderSshdConfig({ passwordAuthentication }) {
  return [
    'PermitRootLogin no',
    `PasswordAuthentication ${passwordAuthentication ? 'yes' : 'no'}`,
    'ChallengeResponseAuthentication no',
    'KbdInteractiveAuthentication no',
    'PermitEmptyPasswords no',
    `AllowUsers ${SYSTEM_USER}`,
    '',
  ].join('\n')
}

function runCommand(command, args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })

    if (input === null) {
      child.stdin.end()
    } else {
      child.stdin.end(input)
    }
  })
}

async function setSshPasswordAuthentication(enabled) {
  const tmp = join(tmpdir(), `opensonix-sshd-${randomUUID()}.conf`)
  await writeFile(tmp, renderSshdConfig({ passwordAuthentication: enabled }), { mode: 0o600 })
  try {
    await runCommand('sudo', ['install', '-m', '644', '-o', 'root', '-g', 'root', tmp, SSHD_CONFIG])
    await runCommand('sudo', ['systemctl', 'try-reload-or-restart', 'ssh'])
  } finally {
    await rm(tmp, { force: true })
  }
}

export async function setOpenSonixSystemPassword(password, { enableSshPassword = true } = {}) {
  if (typeof password !== 'string' || password.length === 0 || /[\0\r\n]/.test(password)) {
    const err = new Error('Invalid system password')
    err.code = 'INVALID_SYSTEM_PASSWORD'
    throw err
  }

  await runCommand('sudo', ['chpasswd'], `${SYSTEM_USER}:${password}\n`)
  await runCommand('sudo', ['passwd', '-u', SYSTEM_USER])
  await setSshPasswordAuthentication(enableSshPassword)
}
