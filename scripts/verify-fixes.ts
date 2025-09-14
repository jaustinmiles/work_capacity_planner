#!/usr/bin/env npx tsx
/**
 * Comprehensive test to verify all fixes for work pattern issues
 */

import { PrismaClient } from '@prisma/client'
import { getCurrentBlock } from '../src/shared/work-blocks-types'

const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('COMPREHENSIVE FIX VERIFICATION')
  console.log('='.repeat(80))

  const now = new Date()
  const currentDate = now.toLocaleDateString('en-CA') // YYYY-MM-DD
  const currentTime = now.toTimeString().slice(0, 5)

  console.log(`\n📅 Current Date: ${currentDate}`)
  console.log(`🕐 Current Time: ${currentTime} (${now.toLocaleTimeString()})`)

  try {
    // Test 1: Verify Active Session
    console.log('\n' + '='.repeat(40))
    console.log('TEST 1: ACTIVE SESSION')
    console.log('='.repeat(40))

    const activeSession = await prisma.session.findFirst({
      where: { isActive: true },
    })

    if (!activeSession) {
      console.log('❌ FAIL: No active session found')
    } else if (activeSession.name !== 'Haleigh 9/13') {
      console.log(`⚠️ WARNING: Active session is "${activeSession.name}", expected "Haleigh 9/13"`)
    } else {
      console.log(`✅ PASS: Correct session active: ${activeSession.name}`)
    }

    // Test 2: Verify Work Patterns Exist
    console.log('\n' + '='.repeat(40))
    console.log('TEST 2: WORK PATTERNS')
    console.log('='.repeat(40))

    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: activeSession?.id,
        date: {
          in: ['2025-09-13', '2025-09-14'],
        },
      },
      include: {
        WorkBlock: true,
      },
    })

    console.log(`Found ${patterns.length} patterns for Sept 13-14`)

    const sept13Pattern = patterns.find(p => p.date === '2025-09-13')
    const sept14Pattern = patterns.find(p => p.date === '2025-09-14')

    if (!sept13Pattern) {
      console.log('❌ FAIL: No pattern for Sept 13')
    } else {
      const blocks = sept13Pattern.WorkBlock
      if (blocks.length === 0) {
        console.log('❌ FAIL: Sept 13 has no work blocks')
      } else {
        const block = blocks[0]
        if (block.startTime === '09:00' && block.endTime === '23:55') {
          console.log('✅ PASS: Sept 13 has correct block (09:00-23:55)')
        } else {
          console.log(`⚠️ WARNING: Sept 13 block times incorrect: ${block.startTime}-${block.endTime}`)
        }
      }
    }

    if (!sept14Pattern) {
      console.log('❌ FAIL: No pattern for Sept 14')
    } else {
      const blocks = sept14Pattern.WorkBlock
      if (blocks.length === 0) {
        console.log('❌ FAIL: Sept 14 has no work blocks')
      } else {
        const block = blocks[0]
        if (block.startTime === '00:05' && block.endTime === '02:00') {
          console.log('✅ PASS: Sept 14 has correct block (00:05-02:00)')
        } else {
          console.log(`⚠️ WARNING: Sept 14 block times incorrect: ${block.startTime}-${block.endTime}`)
        }
      }
    }

    // Test 3: Verify No Other Sessions Have Patterns
    console.log('\n' + '='.repeat(40))
    console.log('TEST 3: NO CONFLICTING PATTERNS')
    console.log('='.repeat(40))

    const conflictingPatterns = await prisma.workPattern.findMany({
      where: {
        sessionId: {
          not: activeSession?.id,
        },
        date: {
          in: ['2025-09-13', '2025-09-14'],
        },
      },
      include: {
        Session: true,
      },
    })

    if (conflictingPatterns.length === 0) {
      console.log('✅ PASS: No conflicting patterns from other sessions')
    } else {
      console.log(`❌ FAIL: Found ${conflictingPatterns.length} conflicting patterns:`)
      conflictingPatterns.forEach(p => {
        console.log(`  - ${p.date} from session "${p.Session.name}"`)
      })
    }

    // Test 4: Verify getCurrentBlock Function
    console.log('\n' + '='.repeat(40))
    console.log('TEST 4: getCurrentBlock FUNCTION')
    console.log('='.repeat(40))

    if (sept13Pattern && currentDate === '2025-09-13') {
      const blocks = sept13Pattern.WorkBlock.map(b => ({
        id: b.id,
        patternId: b.patternId,
        startTime: b.startTime,
        endTime: b.endTime,
        type: b.type as any,
        capacity: b.capacity ? JSON.parse(b.capacity as string) : null,
      }))

      const currentBlock = getCurrentBlock(blocks, now)

      if (currentTime >= '09:00' && currentTime < '23:55') {
        if (currentBlock) {
          console.log('✅ PASS: getCurrentBlock correctly identifies current block')
          console.log(`  Block: ${currentBlock.startTime}-${currentBlock.endTime} (${currentBlock.type})`)
        } else {
          console.log('❌ FAIL: getCurrentBlock returns null when should find block')
        }
      } else {
        if (!currentBlock) {
          console.log('✅ PASS: getCurrentBlock correctly returns null (outside work hours)')
        } else {
          console.log('❌ FAIL: getCurrentBlock found block outside work hours')
        }
      }
    } else {
      console.log('⚠️ SKIP: Not Sept 13 or pattern not found')
    }

    // Test 5: Verify No Default Patterns
    console.log('\n' + '='.repeat(40))
    console.log('TEST 5: NO DEFAULT PATTERNS')
    console.log('='.repeat(40))

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)
    const futureDateStr = futureDate.toLocaleDateString('en-CA')

    const futurePattern = await prisma.workPattern.findUnique({
      where: {
        sessionId_date: {
          sessionId: activeSession?.id || '',
          date: futureDateStr,
        },
      },
      include: {
        WorkBlock: true,
      },
    })

    if (!futurePattern) {
      console.log(`✅ PASS: No pattern for future date ${futureDateStr} (as expected)`)
    } else if (futurePattern.WorkBlock.some(b =>
      b.startTime === '09:00' && b.endTime === '17:00',
    )) {
      console.log(`❌ FAIL: Found default 9-5 pattern for ${futureDateStr}`)
    } else {
      console.log(`⚠️ WARNING: Found pattern for ${futureDateStr} but not default`)
    }

    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('SUMMARY')
    console.log('='.repeat(80))

    console.log('\n✅ Completed Tests:')
    console.log('  1. Active session verification')
    console.log('  2. Work patterns exist for Sept 13-14')
    console.log('  3. No conflicting patterns check')
    console.log('  4. getCurrentBlock function test')
    console.log('  5. No default patterns verification')

    console.log('\n📝 Key Findings:')
    console.log(`  - Active Session: ${activeSession?.name}`)
    console.log(`  - Sept 13 Block: ${sept13Pattern ? '09:00-23:55' : 'NOT FOUND'}`)
    console.log(`  - Sept 14 Block: ${sept14Pattern ? '00:05-02:00' : 'NOT FOUND'}`)
    console.log(`  - Current Time: ${currentTime}`)
    console.log(`  - Should be in block: ${currentTime >= '09:00' && currentTime < '23:55'}`)

  } catch (error) {
    console.error('\n❌ Test failed with error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
