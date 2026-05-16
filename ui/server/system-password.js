import { spawn } from 'node:child_process'

const SYSTEM_USER = 'opensonix'

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

export async function setOpenSonixSystemPassword(password) {
  if (typeof password !== 'string' || password.length === 0 || /[\0\r\n]/.test(password)) {
    const err = new Error('Invalid system password')
    err.code = 'INVALID_SYSTEM_PASSWORD'
    throw err
  }

  await runCommand('sudo', ['chpasswd'], `${SYSTEM_USER}:${password}\n`)
  await runCommand('sudo', ['passwd', '-u', SYSTEM_USER])
}
