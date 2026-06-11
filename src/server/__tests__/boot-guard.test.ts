/**
 * Boot-guard regression test for the API server.
 *
 * The server must FAIL CLOSED in production: when NODE_ENV=production and
 * TASK_PLANNER_API_KEY is not configured, src/server/index.ts must refuse
 * to start (exit code 1 with a fatal error) instead of serving every
 * request unauthenticated through the published Cloudflare tunnel.
 *
 * This spawns the real server entrypoint as a subprocess; the process
 * exits at the boot guard, before binding a port or touching the database.
 */

import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'

const SERVER_ENTRY = path.resolve(__dirname, '../index.ts')
const TSX_BIN = path.resolve(__dirname, '../../../node_modules/.bin/tsx')
// Syntactically valid so PrismaClient can be constructed; never connected
// because the boot guard exits before any query runs.
const DUMMY_DATABASE_URL =
  'postgresql://user:pass@127.0.0.1:5432/task_planner_boot_guard_test'
const BOOT_TIMEOUT_MS = 30000

interface BootResult {
  exitCode: number | null
  output: string
}

function runServerBoot(env: NodeJS.ProcessEnv): Promise<BootResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [SERVER_ENTRY], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    // If the guard regresses, the server starts listening and never exits:
    // kill it so the test fails on exitCode instead of hanging.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ exitCode: null, output })
    }, BOOT_TIMEOUT_MS)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, output })
    })
  })
}

describe('server boot guard', () => {
  it('REGRESSION: refuses to start in production without TASK_PLANNER_API_KEY', async () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: DUMMY_DATABASE_URL,
      // Ephemeral port: if the guard ever regresses and the server listens,
      // it must not collide with a real server before the kill timeout.
      TASK_PLANNER_PORT: '0',
    }
    delete env.TASK_PLANNER_API_KEY

    const result = await runServerBoot(env)

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('TASK_PLANNER_API_KEY')
    expect(result.output).toContain('refusing to start')
  }, 45000)
})
