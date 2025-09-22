#!/usr/bin/env npx tsx
/**
 * Script to clean up conflicting work patterns from other sessions
 * This helps resolve issues where multiple sessions have patterns for the same dates
 */

import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'

const prisma = new PrismaClient()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  console.log('================================================================================')
  console.log('WORK PATTERN CONFLICT CLEANUP')
  console.log('================================================================================\n')

  try {
    // Get the active session
    const activeSession = await prisma.session.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!activeSession) {
      console.log('❌ No active session found!')
      return
    }

    console.log(`✅ Active Session: ${activeSession.name} (ID: ${activeSession.id})\n`)

    // Find all dates where the active session has patterns
    const activePatterns = await prisma.workPattern.findMany({
      where: { sessionId: activeSession.id },
      select: { date: true },
    })

    if (activePatterns.length === 0) {
      console.log('No patterns found for active session.')
      return
    }

    const activeDates = activePatterns.map(p => p.date)
    console.log(`📅 Active session has patterns for ${activeDates.length} dates\n`)

    // Find conflicting patterns from other sessions
    const conflictingPatterns = await prisma.workPattern.findMany({
      where: {
        date: { in: activeDates },
        sessionId: { not: activeSession.id },
      },
      include: {
        Session: true,
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: [
        { date: 'asc' },
        { Session: { name: 'asc' } },
      ],
    })

    if (conflictingPatterns.length === 0) {
      console.log('✅ No conflicting patterns found!')
      return
    }

    console.log(`⚠️  Found ${conflictingPatterns.length} conflicting patterns:\n`)

    // Group by date for better display
    const conflictsByDate = new Map<string, typeof conflictingPatterns>()
    conflictingPatterns.forEach(pattern => {
      const datePatterns = conflictsByDate.get(pattern.date) || []
      datePatterns.push(pattern)
      conflictsByDate.set(pattern.date, datePatterns)
    })

    // Display conflicts
    conflictsByDate.forEach((patterns, date) => {
      console.log(`📆 ${date}:`)
      patterns.forEach(pattern => {
        console.log(`   - Session: ${pattern.Session?.name || 'Unknown'} (ID: ${pattern.sessionId})`)
        console.log(`     Blocks: ${pattern.WorkBlock.length}, Meetings: ${pattern.WorkMeeting.length}`)
      })
      console.log()
    })

    // Ask for confirmation to delete
    const answer = await question('Do you want to DELETE all these conflicting patterns? (yes/no): ')

    if (answer.toLowerCase() === 'yes') {
      console.log('\n🗑️  Deleting conflicting patterns...')

      const result = await prisma.workPattern.deleteMany({
        where: {
          date: { in: activeDates },
          sessionId: { not: activeSession.id },
        },
      })

      console.log(`✅ Deleted ${result.count} conflicting patterns!`)

      // Verify the cleanup
      const remainingConflicts = await prisma.workPattern.count({
        where: {
          date: { in: activeDates },
          sessionId: { not: activeSession.id },
        },
      })

      if (remainingConflicts === 0) {
        console.log('✅ All conflicts have been resolved!')
      } else {
        console.log(`⚠️  ${remainingConflicts} conflicts still remain.`)
      }
    } else {
      console.log('\n❌ Cleanup cancelled.')
    }

  } catch (error) {
    console.error('Error during cleanup:', error)
  } finally {
    rl.close()
    await prisma.$disconnect()
  }
}

main().catch(console.error)
