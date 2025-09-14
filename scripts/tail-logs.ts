#!/usr/bin/env npx tsx
/**
 * Tail logs from the AppLog table
 * Similar to 'tail -f' for database logs
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'
import chalk from 'chalk'

const prisma = new PrismaClient()

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  level: args.find(a => a.startsWith('--level='))?.split('=')[1],
  grep: args.find(a => a.startsWith('--grep='))?.split('=')[1],
  since: args.find(a => a.startsWith('--since='))?.split('=')[1] || '5m',
  follow: !args.includes('--no-follow'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100'),
}

// Parse since parameter (e.g., '5m', '1h', '30s')
function parseSince(since: string): Date {
  const match = since.match(/^(\d+)([smhd])$/)
  if (!match) {
    console.error('Invalid --since format. Use: 5m, 1h, 30s, 1d')
    process.exit(1)
  }

  const [, num, unit] = match
  const value = parseInt(num)
  const now = new Date()

  switch (unit) {
    case 's':
      return new Date(now.getTime() - value * 1000)
    case 'm':
      return new Date(now.getTime() - value * 60 * 1000)
    case 'h':
      return new Date(now.getTime() - value * 60 * 60 * 1000)
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
    default:
      return now
  }
}

// Format log level with color
function formatLevel(level: string): string {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return chalk.red.bold(level)
    case 'WARN':
      return chalk.yellow(level)
    case 'INFO':
      return chalk.cyan(level)
    case 'DEBUG':
      return chalk.gray(level)
    default:
      return level
  }
}

// Format log entry for display
function formatLog(log: any): void {
  const timestamp = format(new Date(log.createdAt), 'HH:mm:ss.SSS')
  const level = formatLevel(log.level.padEnd(5))
  const source = chalk.magenta(`[${log.source}]`)
  
  let context = ''
  try {
    const contextObj = JSON.parse(log.context)
    if (Object.keys(contextObj).length > 0) {
      // Remove common fields that are redundant
      delete contextObj.source
      delete contextObj.timestamp
      if (Object.keys(contextObj).length > 0) {
        context = chalk.gray(' ' + JSON.stringify(contextObj))
      }
    }
  } catch {
    // Ignore JSON parse errors
  }

  console.log(`${chalk.gray(timestamp)} ${level} ${source} ${log.message}${context}`)
}

async function tailLogs() {
  console.log(chalk.green('='.repeat(80)))
  console.log(chalk.green.bold('LOG TAIL'))
  console.log(chalk.green('='.repeat(80)))
  console.log(chalk.gray(`Options: level=${options.level || 'all'}, grep=${options.grep || 'none'}, since=${options.since}`))
  console.log(chalk.gray('Press Ctrl+C to stop\n'))

  const since = parseSince(options.since)
  let lastLogId: string | null = null

  // Build where clause
  const buildWhere = (afterId?: string) => {
    const where: any = {
      createdAt: { gte: since },
    }

    if (afterId) {
      where.id = { gt: afterId }
    }

    if (options.level) {
      where.level = options.level.toUpperCase()
    }

    if (options.grep) {
      where.OR = [
        { message: { contains: options.grep } },
        { context: { contains: options.grep } },
      ]
    }

    return where
  }

  // Initial query
  const initialLogs = await prisma.appLog.findMany({
    where: buildWhere(),
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  })

  if (initialLogs.length === 0) {
    console.log(chalk.yellow('No logs found matching criteria'))
    if (!options.follow) {
      process.exit(0)
    }
  }

  // Display initial logs
  for (const log of initialLogs) {
    formatLog(log)
    lastLogId = log.id
  }

  // Follow mode - poll for new logs
  if (options.follow) {
    console.log(chalk.gray('\n--- Following logs ---\n'))

    setInterval(async () => {
      try {
        const newLogs = await prisma.appLog.findMany({
          where: buildWhere(lastLogId),
          orderBy: { createdAt: 'asc' },
          take: 100,
        })

        for (const log of newLogs) {
          formatLog(log)
          lastLogId = log.id
        }
      } catch (error) {
        console.error(chalk.red('Error polling logs:'), error)
      }
    }, 500) // Poll every 500ms
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  console.log(chalk.gray('\n\nStopping log tail...'))
  await prisma.$disconnect()
  process.exit(0)
})

// Show help
if (args.includes('--help')) {
  console.log(`
Usage: npx tsx scripts/tail-logs.ts [options]

Options:
  --level=LEVEL    Filter by log level (ERROR, WARN, INFO, DEBUG)
  --grep=PATTERN   Filter by message or context pattern
  --since=TIME     Show logs since TIME ago (e.g., 5m, 1h, 30s, 1d)
  --limit=N        Initial number of logs to show (default: 100)
  --no-follow      Don't follow new logs (like tail without -f)
  --help           Show this help message

Examples:
  npx tsx scripts/tail-logs.ts                    # Tail all logs from last 5 minutes
  npx tsx scripts/tail-logs.ts --level=ERROR      # Only show errors
  npx tsx scripts/tail-logs.ts --grep=scheduler   # Filter for scheduler logs
  npx tsx scripts/tail-logs.ts --since=1h         # Show logs from last hour
`)
  process.exit(0)
}

// Run
tailLogs().catch(error => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})