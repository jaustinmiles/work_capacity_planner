#!/usr/bin/env npx tsx
/**
 * Script to check and fix active session issue
 * Ensures the correct session is marked as active
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const targetSessionName = process.argv[2] || 'Haleigh 9/13'
  
  console.log('='.repeat(80))
  console.log('ACTIVE SESSION FIX')
  console.log('='.repeat(80))
  console.log(`\n🎯 Target session: "${targetSessionName}"`)

  try {
    // [WorkPatternLifeCycle] Check current active session
    console.log('\n[WorkPatternLifeCycle] fix-active-session - START:', {
      targetSessionName,
      timestamp: new Date().toISOString(),
      localTime: new Date().toLocaleTimeString('en-US', { hour12: false })
    })

    // Find all active sessions
    const activeSessions = await prisma.session.findMany({
      where: { isActive: true }
    })

    console.log(`\n📊 Found ${activeSessions.length} active session(s):`)
    activeSessions.forEach(s => {
      console.log(`  - ${s.name} (ID: ${s.id})`)
    })

    // Find the target session
    const targetSession = await prisma.session.findFirst({
      where: {
        name: {
          contains: targetSessionName
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!targetSession) {
      console.error(`\n❌ Target session "${targetSessionName}" not found`)
      process.exit(1)
    }

    console.log(`\n✅ Found target session:`)
    console.log(`  Name: ${targetSession.name}`)
    console.log(`  ID: ${targetSession.id}`)
    console.log(`  Active: ${targetSession.isActive}`)
    console.log(`  Created: ${targetSession.createdAt}`)

    // Check if target session is already active
    if (targetSession.isActive) {
      console.log('\n✅ Target session is already active')
      
      // But check if there are OTHER active sessions
      const otherActiveSessions = activeSessions.filter(s => s.id !== targetSession.id)
      if (otherActiveSessions.length > 0) {
        console.log(`\n⚠️ Found ${otherActiveSessions.length} other active session(s)`)
        console.log('Deactivating other sessions...')
        
        for (const session of otherActiveSessions) {
          await prisma.session.update({
            where: { id: session.id },
            data: { isActive: false }
          })
          console.log(`  - Deactivated: ${session.name}`)
        }
      }
    } else {
      console.log('\n⚠️ Target session is NOT active')
      console.log('Fixing...')

      // Deactivate all other sessions
      await prisma.session.updateMany({
        where: {
          id: { not: targetSession.id }
        },
        data: { isActive: false }
      })
      console.log('  - Deactivated all other sessions')

      // Activate target session
      await prisma.session.update({
        where: { id: targetSession.id },
        data: { isActive: true }
      })
      console.log(`  - Activated: ${targetSession.name}`)
    }

    // Verify the fix
    console.log('\n🔍 Verifying fix...')
    const verifyActive = await prisma.session.findMany({
      where: { isActive: true }
    })

    if (verifyActive.length === 1 && verifyActive[0].id === targetSession.id) {
      console.log('✅ SUCCESS: Only target session is active')
    } else {
      console.error('❌ FAILED: Unexpected active sessions after fix')
      verifyActive.forEach(s => {
        console.log(`  - ${s.name} (ID: ${s.id})`)
      })
    }

    // Check work patterns for the target session
    console.log('\n📅 Checking work patterns for target session...')
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: targetSession.id,
        date: {
          in: ['2025-09-13', '2025-09-14']
        }
      },
      include: {
        WorkBlock: true
      }
    })

    console.log(`Found ${patterns.length} patterns for Sept 13-14:`)
    patterns.forEach(p => {
      console.log(`  Date: ${p.date}`)
      p.WorkBlock.forEach(b => {
        console.log(`    - Block: ${b.startTime} to ${b.endTime} (${b.type})`)
      })
    })

    // [WorkPatternLifeCycle] Log completion
    console.log('\n[WorkPatternLifeCycle] fix-active-session - COMPLETE:', {
      targetSessionName,
      targetSessionId: targetSession.id,
      success: verifyActive.length === 1 && verifyActive[0].id === targetSession.id,
      patternsFound: patterns.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()