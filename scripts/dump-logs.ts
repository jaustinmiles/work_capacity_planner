#!/usr/bin/env npx tsx
/* eslint-disable no-console */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'
import { writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function dumpLogs(outputFile?: string, hoursBack: number = 24) {
  console.log('='.repeat(80))
  console.log('LOG DUMP TOOL')
  console.log('='.repeat(80))

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  // Get error logs
  const errorLogs = await prisma.errorLog.findMany({
    where: {
      createdAt: {
        gte: since,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`\nFound ${errorLogs.length} error logs since ${format(since, 'yyyy-MM-dd HH:mm:ss')}`)

  const logData = {
    dumpDate: new Date().toISOString(),
    since: since.toISOString(),
    errorCount: errorLogs.length,
    logs: errorLogs.map(log => ({
      id: log.id,
      level: log.level,
      message: log.message,
      context: JSON.parse(log.context),
      error: log.error ? JSON.parse(log.error) : null,
      sessionId: log.sessionId,
      createdAt: log.createdAt.toISOString(),
    })),
  }

  if (outputFile) {
    const filePath = outputFile.startsWith('/') ? outputFile : join(process.cwd(), outputFile)
    writeFileSync(filePath, JSON.stringify(logData, null, 2))
    console.log(`\nLogs saved to: ${filePath}`)
  } else {
    console.log('\nERROR LOGS:')
    console.log('-'.repeat(80))

    errorLogs.forEach(log => {
      const context = JSON.parse(log.context)
      const errorData = log.error ? JSON.parse(log.error) : null

      console.log(`\n[${format(log.createdAt, 'yyyy-MM-dd HH:mm:ss')}] ${log.level} - ${log.message}`)
      console.log(`  Context: ${JSON.stringify(context, null, 2)}`)
      if (errorData) {
        console.log(`  Error: ${JSON.stringify(errorData, null, 2)}`)
      }
    })
  }

  // Get log metrics
  const metrics = await prisma.logMetric.findMany({
    where: {
      createdAt: {
        gte: since,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  if (metrics.length > 0) {
    console.log('\n📊 RECENT METRICS:')
    console.log('-'.repeat(80))

    metrics.forEach(metric => {
      console.log(`\n[${format(metric.createdAt, 'yyyy-MM-dd HH:mm:ss')}] ${metric.processType}`)
      console.log(`  Logs: ${metric.logCount} | Errors: ${metric.errorCount}`)
      console.log(`  Memory: ${metric.memoryUsage} | CPU: ${metric.cpuUsage.toFixed(2)}%`)
    })
  }

  console.log('\n' + '='.repeat(80))
}

// Parse command line arguments
const args = process.argv.slice(2)
const outputFile = args.find(arg => !arg.startsWith('--'))
const hoursFlag = args.find(arg => arg.startsWith('--hours='))
const hours = hoursFlag ? parseInt(hoursFlag.split('=')[1]) : 24

console.log(`Dumping logs from the last ${hours} hours...`)

dumpLogs(outputFile, hours)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
