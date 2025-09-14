#!/usr/bin/env npx tsx
/**
 * Script to debug work patterns and blocks for a specific session
 * Usage: npx tsx scripts/debug-workpatterns.ts [session-name]
 * 
 * This script will:
 * 1. Find the session by name
 * 2. Query all WorkPatterns for that session
 * 3. Include all related WorkBlocks
 * 4. Save the structured output to a JSON file
 * 5. Display analysis of the data
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  const sessionNameSearch = process.argv[2] || 'Haleigh 9/13'
  const outputDir = path.join(process.cwd(), 'debug-output')
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  try {
    console.log('='.repeat(80))
    console.log('WORK PATTERN DEBUG ANALYSIS')
    console.log('='.repeat(80))
    console.log(`\n🔍 Searching for session: "${sessionNameSearch}"`)

    // Find session
    const session = await prisma.session.findFirst({
      where: {
        name: {
          contains: sessionNameSearch,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!session) {
      console.error(`❌ No session found matching "${sessionNameSearch}"`)
      
      // Show available sessions
      const allSessions = await prisma.session.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      })
      
      console.log('\n📋 Available sessions:')
      allSessions.forEach(s => {
        console.log(`  - ${s.name} (ID: ${s.id}, Active: ${s.isActive})`)
      })
      
      process.exit(1)
    }

    console.log('\n✅ Session found:')
    console.log(`  Name: ${session.name}`)
    console.log(`  ID: ${session.id}`)
    console.log(`  Active: ${session.isActive}`)
    console.log(`  Created: ${session.createdAt}`)

    // Get ALL work patterns for this session
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: session.id,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
        WorkSession: true,
      },
      orderBy: { date: 'asc' },
    })

    console.log(`\n📅 Work Patterns found: ${patterns.length}`)

    // Get today's date info for comparison
    const now = new Date()
    const todayLocal = now.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
    const todayUTC = now.toISOString().split('T')[0]
    const currentTimeLocal = now.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5)
    
    console.log('\n🕐 Current Time Info:')
    console.log(`  Local Date: ${todayLocal}`)
    console.log(`  UTC Date: ${todayUTC}`)
    console.log(`  Local Time: ${currentTimeLocal}`)
    console.log(`  Full ISO: ${now.toISOString()}`)

    // Analyze patterns
    const analysisData: any = {
      session: {
        id: session.id,
        name: session.name,
        isActive: session.isActive,
        createdAt: session.createdAt,
      },
      currentTime: {
        localDate: todayLocal,
        utcDate: todayUTC,
        localTime: currentTimeLocal,
        isoTime: now.toISOString(),
      },
      patterns: [],
      analysis: {
        totalPatterns: patterns.length,
        patternsWithBlocks: 0,
        patternsWithMeetings: 0,
        emptyPatterns: 0,
        todayPattern: null,
        tomorrowPattern: null,
        currentBlock: null,
      },
    }

    // Process each pattern
    patterns.forEach(pattern => {
      const patternData: any = {
        id: pattern.id,
        date: pattern.date,
        isTemplate: pattern.isTemplate,
        templateName: pattern.templateName,
        blocks: pattern.WorkBlock.map(block => ({
          id: block.id,
          startTime: block.startTime,
          endTime: block.endTime,
          type: block.type,
          capacity: block.capacity ? JSON.parse(block.capacity as string) : null,
          focusCapacity: block.focusCapacity,
          adminCapacity: block.adminCapacity,
        })),
        meetings: pattern.WorkMeeting.map(meeting => ({
          id: meeting.id,
          name: meeting.name,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          type: meeting.type,
          recurring: meeting.recurring,
          daysOfWeek: meeting.daysOfWeek ? JSON.parse(meeting.daysOfWeek as string) : null,
        })),
        sessions: pattern.WorkSession.length,
      }

      analysisData.patterns.push(patternData)

      // Update analysis counts
      if (pattern.WorkBlock.length > 0) analysisData.analysis.patternsWithBlocks++
      if (pattern.WorkMeeting.length > 0) analysisData.analysis.patternsWithMeetings++
      if (pattern.WorkBlock.length === 0 && pattern.WorkMeeting.length === 0) {
        analysisData.analysis.emptyPatterns++
      }

      // Check if this is today's or tomorrow's pattern
      if (pattern.date === todayLocal) {
        analysisData.analysis.todayPattern = patternData
        
        // Check if we're currently in a work block
        pattern.WorkBlock.forEach(block => {
          if (currentTimeLocal >= block.startTime && currentTimeLocal < block.endTime) {
            analysisData.analysis.currentBlock = {
              ...block,
              remainingMinutes: calculateRemainingMinutes(currentTimeLocal, block.endTime),
            }
          }
        })
      }
      
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toLocaleDateString('en-CA')
      if (pattern.date === tomorrowStr) {
        analysisData.analysis.tomorrowPattern = patternData
      }
    })

    // Display detailed analysis
    console.log('\n📊 Pattern Analysis:')
    console.log(`  Total patterns: ${analysisData.analysis.totalPatterns}`)
    console.log(`  Patterns with blocks: ${analysisData.analysis.patternsWithBlocks}`)
    console.log(`  Patterns with meetings: ${analysisData.analysis.patternsWithMeetings}`)
    console.log(`  Empty patterns: ${analysisData.analysis.emptyPatterns}`)

    // Display patterns for the next few days
    console.log('\n📆 Upcoming Patterns:')
    const upcomingDates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i)
      const dateStr = date.toLocaleDateString('en-CA')
      upcomingDates.push(dateStr)
      
      const pattern = patterns.find(p => p.date === dateStr)
      if (pattern) {
        console.log(`  ${dateStr}: ${pattern.WorkBlock.length} blocks, ${pattern.WorkMeeting.length} meetings`)
        pattern.WorkBlock.forEach(block => {
          console.log(`    - ${block.startTime} to ${block.endTime}: ${block.type}`)
        })
      } else {
        console.log(`  ${dateStr}: No pattern defined`)
      }
    }

    // Check for Sept 13-14 specifically
    console.log('\n🎯 September 13-14 Analysis:')
    const sept13 = patterns.find(p => p.date === '2025-09-13')
    const sept14 = patterns.find(p => p.date === '2025-09-14')
    
    if (sept13) {
      console.log('  Sept 13 pattern found:')
      sept13.WorkBlock.forEach(block => {
        console.log(`    - ${block.startTime} to ${block.endTime}: ${block.type}`)
      })
    } else {
      console.log('  Sept 13: No pattern found')
    }
    
    if (sept14) {
      console.log('  Sept 14 pattern found:')
      sept14.WorkBlock.forEach(block => {
        console.log(`    - ${block.startTime} to ${block.endTime}: ${block.type}`)
      })
    } else {
      console.log('  Sept 14: No pattern found')
    }

    // Check current block status
    if (analysisData.analysis.currentBlock) {
      console.log('\n✅ CURRENTLY IN WORK BLOCK:')
      console.log(`  Time: ${analysisData.analysis.currentBlock.startTime} - ${analysisData.analysis.currentBlock.endTime}`)
      console.log(`  Type: ${analysisData.analysis.currentBlock.type}`)
      console.log(`  Remaining: ${analysisData.analysis.currentBlock.remainingMinutes} minutes`)
    } else {
      console.log('\n⚠️  NOT currently in a work block')
    }

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputFile = path.join(outputDir, `workpatterns-${timestamp}.json`)
    fs.writeFileSync(outputFile, JSON.stringify(analysisData, null, 2))
    console.log(`\n💾 Data saved to: ${outputFile}`)

    // Also check for any patterns from other sessions that might be interfering
    console.log('\n🔍 Checking for patterns from other sessions on same dates:')
    for (const dateStr of upcomingDates.slice(0, 3)) {
      const otherPatterns = await prisma.workPattern.findMany({
        where: {
          date: dateStr,
          sessionId: {
            not: session.id,
          },
        },
        include: {
          Session: true,
        },
      })
      
      if (otherPatterns.length > 0) {
        console.log(`  ⚠️ ${dateStr}: Found ${otherPatterns.length} patterns from other sessions:`)
        otherPatterns.forEach(p => {
          console.log(`    - Session: ${p.Session.name} (ID: ${p.sessionId})`)
        })
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

function calculateRemainingMinutes(currentTime: string, endTime: string): number {
  const [currentHour, currentMin] = currentTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  
  const currentMinutes = currentHour * 60 + currentMin
  const endMinutes = endHour * 60 + endMin
  
  return endMinutes - currentMinutes
}

main()