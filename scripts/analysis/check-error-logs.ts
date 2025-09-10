#!/usr/bin/env npx tsx
/**
 * Script to check error logs in database
 * Shows recent errors with full context
 * Usage: npx tsx scripts/check-error-logs.ts [hours-back]
 *
 * Note: This script uses console.log for output - this is intentional and acceptable
 * Scripts are allowed to use console for direct user output
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  const hoursBack = parseInt(process.argv[2] || '1')
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  try {
    console.log('=' .repeat(80))
    console.log('ERROR LOG ANALYSIS')
    console.log('=' .repeat(80))
    console.log(`Analyzing errors since: ${format(since, 'yyyy-MM-dd HH:mm:ss')}`)
    console.log()

    // Get recent errors
    const errors = await prisma.errorLog.findMany({
      where: {
        level: 'ERROR',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    console.log(`Found ${errors.length} errors in the last ${hoursBack} hour(s)`)
    console.log('-'.repeat(80))

    errors.forEach((error, idx) => {
      console.log(`\n[${idx + 1}] ${error.createdAt ? format(error.createdAt, 'HH:mm:ss') : 'No timestamp'}`)
      console.log(`  Message: ${error.message}`)

      // Parse context if it's JSON
      if (error.context) {
        try {
          const ctx = JSON.parse(error.context)
          console.log(`  Timestamp from context: ${ctx.timestamp || 'N/A'}`)

          // Show other context fields
          Object.keys(ctx).forEach(key => {
            if (key !== 'timestamp' && key !== 'processType') {
              const value = typeof ctx[key] === 'object' ? JSON.stringify(ctx[key], null, 2) : ctx[key]
              console.log(`  ${key}: ${value}`)
            }
          })
        } catch (_e) {
          console.log(`  Context: ${error.context}`)
        }
      }

      // Show error details
      if (error.error) {
        console.log(`  Error: ${error.error.substring(0, 200)}`)
        if (error.error.length > 200) {
          console.log(`  ... (${error.error.length - 200} more characters)`)
        }
      }
    })

    // Check for patterns
    console.log('\n' + '=' .repeat(80))
    console.log('ERROR PATTERNS')
    console.log('-'.repeat(80))

    const messageGroups = errors.reduce((acc, err) => {
      const key = err.message
      if (!acc[key]) acc[key] = 0
      acc[key]++
      return acc
    }, {} as Record<string, number>)

    Object.entries(messageGroups)
      .sort((a, b) => b[1] - a[1])
      .forEach(([msg, count]) => {
        console.log(`  ${count}x: ${msg}`)
      })

    // Check for Eisenhower-specific errors
    console.log('\n' + '=' .repeat(80))
    console.log('EISENHOWER-SPECIFIC ERRORS')
    console.log('-'.repeat(80))

    const eisenhowerErrors = await prisma.errorLog.findMany({
      where: {
        OR: [
          { message: { contains: 'eisenhower' } },
          { message: { contains: 'Eisenhower' } },
          { message: { contains: 'scatter' } },
          { context: { contains: 'eisenhower' } },
        ],
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (eisenhowerErrors.length > 0) {
      console.log(`Found ${eisenhowerErrors.length} Eisenhower-related entries`)
      eisenhowerErrors.forEach(err => {
        console.log(`\n  ${err.createdAt ? format(err.createdAt, 'HH:mm:ss') : 'N/A'}: ${err.message}`)
        if (err.error) {
          console.log(`    Error: ${err.error.substring(0, 100)}...`)
        }
      })
    } else {
      console.log('No Eisenhower-specific errors found')
    }

    console.log()
    console.log('=' .repeat(80))

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
