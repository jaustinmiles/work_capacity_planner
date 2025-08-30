#!/usr/bin/env npx tsx
/**
 * Script to inspect WorkBlock data to understand scheduling
 * Usage: npx tsx scripts/inspect-workblocks.ts [session-name]
 */

import { PrismaClient } from '@prisma/client'
import { format, parseISO } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  const sessionNameSearch = process.argv[2]

  try {
    // Find session
    let session
    if (sessionNameSearch) {
      session = await prisma.session.findFirst({
        where: {
          name: {
            contains: sessionNameSearch,
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      // Get most recent session
      session = await prisma.session.findFirst({
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!session) {
      console.error(`❌ No session found ${sessionNameSearch ? `matching "${sessionNameSearch}"` : ''}`)
      process.exit(1)
    }

    console.log('='.repeat(80))
    console.log('WORK BLOCKS INSPECTION')
    console.log('='.repeat(80))

    console.log('\n📅 SESSION:')
    console.log(`  Name: ${session.name}`)
    console.log(`  ID: ${session.id}`)

    // Get work patterns for this session
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: session.id,
      },
      include: {
        WorkBlock: {
          orderBy: { startTime: 'asc' },
        },
        WorkMeeting: {
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { date: 'asc' },
    })

    if (patterns.length === 0) {
      console.log('\n⚠️  No work patterns found for this session')
      process.exit(0)
    }

    console.log(`\n⏰ WORK PATTERNS WITH BLOCKS (${patterns.length} days):`)
    console.log('-'.repeat(80))

    const issues: string[] = []

    for (const pattern of patterns) {
      console.log(`\n📅 ${pattern.date}:`)

      if (pattern.WorkBlock.length === 0 && pattern.WorkMeeting.length === 0) {
        console.log('  No blocks or meetings scheduled')
        continue
      }

      // Process WorkBlocks
      if (pattern.WorkBlock.length > 0) {
        console.log(`  Work Blocks (${pattern.WorkBlock.length}):`)
        for (const block of pattern.WorkBlock) {
          console.log(`    ${block.startTime} - ${block.endTime}: ${block.type}`)

          // Check the structure of block data
          const fields = Object.keys(block)
          if (fields.includes('tasks') || fields.includes('items')) {
            console.log(`      Additional fields: ${fields.filter(f => !['id', 'workPatternId', 'startTime', 'endTime', 'type'].includes(f)).join(', ')}`)

            // Try to inspect tasks/items if they exist
            if ('tasks' in block && (block as any).tasks) {
              const tasks = (block as any).tasks
              console.log(`      Tasks type: ${typeof tasks}`)
              if (typeof tasks === 'string') {
                try {
                  const parsed = JSON.parse(tasks)
                  console.log('      Parsed tasks:')
                  if (Array.isArray(parsed)) {
                    for (const task of parsed) {
                      const taskName = typeof task === 'string' ? task : task.name || JSON.stringify(task)
                      console.log(`        - ${taskName}`)

                      // Check for bedtime tasks with time issues
                      if (taskName.toLowerCase().includes('bedtime') ||
                          taskName.toLowerCase().includes('sleep') ||
                          taskName.toLowerCase().includes('evening')) {
                        // Parse the block time to check AM/PM
                        const [hours] = block.startTime.split(':').map(Number)
                        if (hours < 12) {
                          const issue = `Bedtime/evening task "${taskName}" scheduled at ${block.startTime} (morning!)`
                          issues.push(issue)
                          console.log(`        🚨 WARNING: ${issue}`)
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.log(`      Could not parse tasks: ${e}`)
                }
              }
            }
          }

          // Check for bedtime blocks scheduled in morning
          if (block.type === 'sleep' || block.type === 'blocked-time') {
            const [hours] = block.startTime.split(':').map(Number)
            const [endHours] = block.endTime.split(':').map(Number)

            // Check if this looks like a nighttime sleep block scheduled in morning
            if (block.type === 'sleep' && hours < 12 && endHours < 12) {
              // This might be okay if it's an overnight sleep (e.g., 23:00 - 07:00)
              // But if both are morning times, it's wrong
              if (hours >= 6 && hours <= 11) {
                const issue = `Sleep block scheduled during morning hours: ${block.startTime} - ${block.endTime}`
                issues.push(issue)
                console.log(`      🚨 WARNING: ${issue}`)
              }
            }
          }
        }
      }

      // Process WorkMeetings
      if (pattern.WorkMeeting.length > 0) {
        console.log(`  Meetings/Sleep Blocks (${pattern.WorkMeeting.length}):`)
        for (const meeting of pattern.WorkMeeting) {
          console.log(`    ${meeting.startTime} - ${meeting.endTime}: ${meeting.title}`)
          console.log(`      Type: ${meeting.type}`)

          // Check for bedtime meetings scheduled in morning
          const titleLower = meeting.title.toLowerCase()
          if (titleLower.includes('bedtime') ||
              titleLower.includes('sleep') ||
              titleLower.includes('evening')) {
            const [hours] = meeting.startTime.split(':').map(Number)
            if (hours < 12) {
              const issue = `Evening/bedtime meeting "${meeting.title}" scheduled at ${meeting.startTime} (morning!)`
              issues.push(issue)
              console.log(`      🚨 WARNING: ${issue}`)
            }
          }
        }
      }
    }

    // Summary of issues
    if (issues.length > 0) {
      console.log('\n🚨 SCHEDULING ISSUES FOUND:')
      console.log('='.repeat(80))
      issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`)
      })

      console.log('\n💡 LIKELY CAUSE:')
      console.log('The scheduler appears to be confusing AM/PM times when scheduling evening routines.')
      console.log('This could be due to:')
      console.log('1. Time parsing not preserving PM designation')
      console.log('2. 12-hour to 24-hour conversion issues')
      console.log('3. Scheduler treating "9:00" as AM by default when it should be PM for evening tasks')
    } else {
      console.log('\n✅ No obvious scheduling issues detected')
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
