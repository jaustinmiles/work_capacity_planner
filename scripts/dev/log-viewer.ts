#!/usr/bin/env npx tsx
/**
 * Professional Log Viewer
 * Clean, interactive log viewing without excessive grep usage
 */

import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { spawn } from 'child_process'

const LOG_DIR = path.join(process.env.HOME!, 'Library/Logs/task-planner')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

interface LogOptions {
  lines?: number
  follow?: boolean
  since?: string
  grep?: string
  level?: string
  module?: string
  json?: boolean
  clear?: boolean
}

const program = new Command()
  .name('log-viewer')
  .description('Professional log viewer for task-planner')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .option('-s, --since <time>', 'Show logs since time (e.g., "5m", "1h", "10:30")')
  .option('-g, --grep <pattern>', 'Filter by pattern')
  .option('-l, --level <level>', 'Filter by log level (debug/info/warn/error)')
  .option('-m, --module <module>', 'Filter by module (e.g., scheduler, database)')
  .option('-j, --json', 'Show raw JSON logs')
  .option('-c, --clear', 'Clear log file and exit')
  .option('--stats', 'Show log statistics')

program.parse()
const options = program.opts() as LogOptions

// Clear logs if requested
if (options.clear) {
  if (fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '')
    console.log('✅ Log file cleared')
  }
  process.exit(0)
}

// Show stats if requested
if ((options as any).stats) {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found')
    process.exit(0)
  }

  const stats = fs.statSync(LOG_FILE)
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  const levels = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  }

  lines.forEach(line => {
    try {
      const log = JSON.parse(line)
      if (log.level && Object.prototype.hasOwnProperty.call(levels, log.level)) {
        levels[log.level as keyof typeof levels]++
      }
    } catch {
      // Ignore JSON parse errors
    }
  })

  console.log('📊 Log Statistics')
  console.log('================')
  console.log(`File: ${LOG_FILE}`)
  console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`)
  console.log(`Lines: ${lines.length}`)
  console.log('\nLog Levels:')
  console.log(`  DEBUG: ${levels.debug}`)
  console.log(`  INFO:  ${levels.info}`)
  console.log(`  WARN:  ${levels.warn}`)
  console.log(`  ERROR: ${levels.error}`)

  process.exit(0)
}

// Build filter function
function matchesFilters(line: string): boolean {
  if (!line.trim()) return false

  try {
    const log = JSON.parse(line)

    // Level filter
    if (options.level && log.level !== options.level) {
      return false
    }

    // Module filter
    if (options.module && !log.module?.includes(options.module)) {
      return false
    }

    // Pattern filter
    if (options.grep) {
      const pattern = new RegExp(options.grep, 'i')
      if (!pattern.test(JSON.stringify(log))) {
        return false
      }
    }

    // Time filter
    if (options.since) {
      const logTime = new Date(log.timestamp)
      let sinceTime: Date

      // Parse time format
      if (options.since.includes(':')) {
        // Absolute time like "10:30"
        const [hours, minutes] = options.since.split(':').map(Number)
        sinceTime = new Date()
        sinceTime.setHours(hours, minutes, 0, 0)
      } else {
        // Relative time like "5m" or "1h"
        const match = options.since.match(/^(\d+)([mh])$/)
        if (match) {
          const [, amount, unit] = match
          const minutes = unit === 'h' ? parseInt(amount) * 60 : parseInt(amount)
          sinceTime = new Date(Date.now() - minutes * 60000)
        } else {
          sinceTime = new Date(0)
        }
      }

      if (logTime < sinceTime) {
        return false
      }
    }

    return true
  } catch {
    // Not JSON, apply simple grep if specified
    if (options.grep) {
      const pattern = new RegExp(options.grep, 'i')
      return pattern.test(line)
    }
    return true
  }
}

// Format log line for display
function formatLog(line: string): string {
  if (options.json) return line

  try {
    const log = JSON.parse(line)
    const time = new Date(log.timestamp).toLocaleTimeString()
    const level = (log.level || 'info').toUpperCase().padEnd(5)
    const module = log.module ? `[${log.module}]` : ''

    // Color based on level
    const levelColors: Record<string, string> = {
      DEBUG: '\x1b[90m', // gray
      INFO: '\x1b[36m',  // cyan
      WARN: '\x1b[33m',  // yellow
      ERROR: '\x1b[31m',  // red
    }
    const color = levelColors[level.trim()] || ''
    const reset = '\x1b[0m'

    let message = log.message || ''
    if (log.data) {
      message += ' ' + JSON.stringify(log.data, null, 2)
    }

    return `${color}${time} ${level}${reset} ${module} ${message}`
  } catch {
    return line
  }
}

// Main execution
if (!fs.existsSync(LOG_FILE)) {
  console.log('No log file found. Start the app to generate logs.')
  process.exit(0)
}

if (options.follow) {
  // Follow mode - use tail
  console.log('📡 Following logs... (Ctrl+C to stop)\n')

  const tail = spawn('tail', ['-f', LOG_FILE])
  const rl = readline.createInterface({
    input: tail.stdout,
    crlfDelay: Infinity,
  })

  rl.on('line', (line) => {
    if (matchesFilters(line)) {
      console.log(formatLog(line))
    }
  })

  tail.stderr.on('data', (data) => {
    console.error(`Error: ${data}`)
  })

} else {
  // Static mode - read file
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  const lines = content.split('\n')
  const filtered = lines.filter(matchesFilters)
  const toShow = filtered.slice(-parseInt(options.lines || '50'))

  if (toShow.length === 0) {
    console.log('No matching logs found')
  } else {
    console.log(`📋 Showing ${toShow.length} log entries:\n`)
    toShow.forEach(line => {
      console.log(formatLog(line))
    })
  }
}
