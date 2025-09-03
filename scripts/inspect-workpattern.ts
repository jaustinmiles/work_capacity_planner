#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Script to inspect WorkPattern data and understand how schedules are stored
 * Usage: npx tsx scripts/inspect-workpattern.ts [session-name]
 */

import { PrismaClient } from '@prisma/client'

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
    console.log('WORK PATTERN INSPECTION')
    console.log('='.repeat(80))

    console.log('\n📅 SESSION:')
    console.log(`  Name: ${session.name}`)
    console.log(`  ID: ${session.id}`)

    // Get work patterns for this session
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: session.id,
      },
      orderBy: { date: 'asc' },
    })

    if (patterns.length === 0) {
      console.log('\n⚠️  No work patterns found for this session')

      // Check if there are ANY work patterns
      const allPatterns = await prisma.workPattern.findMany({
        take: 5,
        orderBy: { date: 'desc' },
      })

      if (allPatterns.length > 0) {
        console.log('\n📊 Recent work patterns from other sessions:')
        for (const p of allPatterns) {
          console.log(`  - ${p.date} (Session: ${p.sessionId.substring(0, 8)}...)`)
        }
      }
      process.exit(0)
    }

    console.log(`\n⏰ WORK PATTERNS (${patterns.length} total):`)
    console.log('-'.repeat(80))

    for (const pattern of patterns) {
      console.log(`\n  Date: ${pattern.date}`)
      console.log(`  ID: ${pattern.id}`)

      // Check what fields exist
      const fields = Object.keys(pattern)
      console.log(`  Available fields: ${fields.join(', ')}`)

      // Try to access pattern field (might be JSON)
      if ('pattern' in pattern) {
        const patternData = (pattern as any).pattern
        console.log(`  Pattern type: ${typeof patternData}`)

        if (patternData) {
          try {
            // If it's a string, try to parse as JSON
            const parsed = typeof patternData === 'string' ? JSON.parse(patternData) : patternData
            console.log('  Pattern structure:')
            console.log(JSON.stringify(parsed, null, 2))

            // Look for schedule data
            if (parsed.blocks && Array.isArray(parsed.blocks)) {
              console.log(`\n  📅 Schedule blocks (${parsed.blocks.length}):`)
              for (const block of parsed.blocks) {
                console.log(`    ${block.startTime || 'N/A'} - ${block.endTime || 'N/A'}: ${block.type || 'N/A'}`)
                if (block.tasks && Array.isArray(block.tasks)) {
                  for (const task of block.tasks) {
                    console.log(`      - ${task.name || task}`)
                  }
                }
              }
            }

            // Look for scheduled items
            if (parsed.scheduledItems && Array.isArray(parsed.scheduledItems)) {
              console.log(`\n  📋 Scheduled items (${parsed.scheduledItems.length}):`)
              for (const item of parsed.scheduledItems) {
                console.log(`    ${item.startTime || 'N/A'} - ${item.endTime || 'N/A'}: ${item.name || 'N/A'}`)
              }
            }
          } catch (e) {
            console.log('  Could not parse pattern as JSON:', e)
          }
        }
      }

      // Only show first 3 patterns in detail to avoid clutter
      if (patterns.indexOf(pattern) >= 2) {
        console.log('\n  ... (additional patterns omitted for brevity)')
        break
      }
    }

    // Check for scheduling issues
    console.log('\n🔍 LOOKING FOR BEDTIME ROUTINE SCHEDULING:')
    console.log('-'.repeat(80))

    let foundBedtimeIssue = false
    for (const pattern of patterns) {
      if ('pattern' in pattern && (pattern as any).pattern) {
        try {
          const parsed = typeof (pattern as any).pattern === 'string'
            ? JSON.parse((pattern as any).pattern)
            : (pattern as any).pattern

          // Search for bedtime-related tasks
          const searchInObject = (obj: any, path: string = ''): void => {
            if (!obj) return

            if (typeof obj === 'string') {
              const lower = obj.toLowerCase()
              if (lower.includes('bedtime') || lower.includes('sleep') || lower.includes('evening')) {
                console.log(`  Found "${obj}" at ${path} in pattern for ${pattern.date}`)
                foundBedtimeIssue = true
              }
            } else if (Array.isArray(obj)) {
              obj.forEach((item, i) => searchInObject(item, `${path}[${i}]`))
            } else if (typeof obj === 'object') {
              Object.entries(obj).forEach(([key, value]) => {
                searchInObject(value, path ? `${path}.${key}` : key)
              })
            }
          }

          searchInObject(parsed)
        } catch (e) {
          console.log('  Could not parse pattern as JSON:', e)
        }
      }
    }

    if (!foundBedtimeIssue) {
      console.log('  No bedtime routine found in work patterns')
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
