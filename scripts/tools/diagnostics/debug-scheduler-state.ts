#!/usr/bin/env npx tsx
/**
 * Debug script to analyze scheduler state and understand why tasks aren't scheduling
 */

import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('SCHEDULER STATE DEBUG ANALYSIS')
  console.log('=' .repeat(80))

  // Get active session
  const session = await prisma.session.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!session) {
    console.error('❌ No active session found')
    return
  }

  console.log(`\n✅ Active Session: ${session.name} (ID: ${session.id})`)

  // Get current time info
  const now = new Date()
  const localNow = dayjs()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

  console.log('\n⏰ Current Time:')
  console.log(`  Local: ${localNow.format('YYYY-MM-DD HH:mm:ss')}`)
  console.log(`  UTC: ${now.toISOString()}`)
  console.log(`  Time String: ${currentTimeStr}`)

  // Get today's work pattern
  const todayStr = localNow.format('YYYY-MM-DD')
  const pattern = await prisma.workPattern.findFirst({
    where: {
      sessionId: session.id,
      date: todayStr,
    },
    include: { WorkBlock: true },
  })

  console.log(`\n📅 Today's Pattern (${todayStr}):`)
  if (!pattern) {
    console.log('  ❌ No pattern found')
  } else {
    console.log(`  ✅ Pattern found with ${pattern.WorkBlock.length} blocks`)

    // Check each block
    for (const block of pattern.WorkBlock) {
      const [startHour, startMin] = block.startTime.split(':').map(Number)
      const [endHour, endMin] = block.endTime.split(':').map(Number)

      // Calculate if we're in this block
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      const currentMinutes = currentHour * 60 + currentMinute

      const isCurrentBlock = currentMinutes >= startMinutes && currentMinutes < endMinutes
      const isPastBlock = currentMinutes >= endMinutes
      const _isFutureBlock = currentMinutes < startMinutes

      const totalMinutes = endMinutes - startMinutes
      const remainingMinutes = isCurrentBlock ? endMinutes - currentMinutes : 0

      console.log(`\n  📦 Block: ${block.startTime} - ${block.endTime}`)
      console.log(`    Type: ${block.type}`)
      console.log(`    Total Duration: ${totalMinutes} minutes`)

      // Parse capacity
      let focusCapacity = 0
      let adminCapacity = 0
      if (block.capacity) {
        try {
          const capacity = typeof block.capacity === 'string'
            ? JSON.parse(block.capacity)
            : block.capacity
          focusCapacity = capacity.focusMinutes || 0
          adminCapacity = capacity.adminMinutes || 0
        } catch (e) {
          console.error('    ❌ Failed to parse capacity:', e)
        }
      }

      console.log(`    Capacity: Focus=${focusCapacity}min, Admin=${adminCapacity}min`)

      if (isCurrentBlock) {
        console.log(`    ✅ CURRENT BLOCK - ${remainingMinutes} minutes remaining`)
      } else if (isPastBlock) {
        console.log(`    ⏩ Past block (ended ${endMinutes - currentMinutes} minutes ago)`)
      } else {
        console.log(`    ⏳ Future block (starts in ${startMinutes - currentMinutes} minutes)`)
      }
    }
  }

  // Get incomplete tasks
  const tasks = await prisma.task.findMany({
    where: {
      sessionId: session.id,
      completed: false,
    },
  })

  const workflows = await prisma.sequencedTask.findMany({
    where: {
      sessionId: session.id,
      overallStatus: { not: 'completed' },
    },
    include: { TaskStep: true },
  })

  console.log('\n📋 Work Items:')
  console.log(`  Tasks: ${tasks.length} incomplete`)
  console.log(`  Workflows: ${workflows.length} incomplete`)

  // Calculate total work
  let focusTotal = 0
  let adminTotal = 0
  let personalTotal = 0

  tasks.forEach(t => {
    if (t.type === 'focused') focusTotal += t.duration
    else if (t.type === 'admin') adminTotal += t.duration
    else if (t.type === 'personal') personalTotal += t.duration
  })

  workflows.forEach(w => {
    w.TaskStep.forEach(s => {
      if (s.type === 'focused') focusTotal += s.duration
      else if (s.type === 'admin') adminTotal += s.duration
      else if (s.type === 'personal') personalTotal += s.duration
    })
  })

  console.log('\n⏱️ Total Work Needed:')
  console.log(`  Focus: ${focusTotal} minutes`)
  console.log(`  Admin: ${adminTotal} minutes`)
  console.log(`  Personal: ${personalTotal} minutes`)
  console.log(`  TOTAL: ${focusTotal + adminTotal + personalTotal} minutes`)

  // Analyze scheduling potential
  console.log('\n🎯 Scheduling Analysis:')

  if (pattern && pattern.WorkBlock.length > 0) {
    let totalAvailableToday = 0
    let currentBlockAvailable = 0

    for (const block of pattern.WorkBlock) {
      const [startHour, startMin] = block.startTime.split(':').map(Number)
      const [endHour, endMin] = block.endTime.split(':').map(Number)

      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      const currentMinutes = currentHour * 60 + currentMinute

      if (currentMinutes < endMinutes) {
        // Block is current or future
        const availableStart = Math.max(startMinutes, currentMinutes)
        const availableMinutes = endMinutes - availableStart
        totalAvailableToday += availableMinutes

        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          currentBlockAvailable = availableMinutes
        }
      }
    }

    console.log(`  Available today from now: ${totalAvailableToday} minutes`)
    console.log(`  Available in current block: ${currentBlockAvailable} minutes`)

    if (currentBlockAvailable > 0) {
      console.log('\n  ✅ SHOULD BE SCHEDULING IN CURRENT BLOCK!')
      console.log(`  Can fit ${Math.floor(currentBlockAvailable / 30)} 30-minute tasks`)
    } else if (totalAvailableToday > 0) {
      console.log('\n  ⏳ Should schedule in future blocks today')
    } else {
      console.log('\n  ❌ No time available today')
    }
  }

  // Check for tomorrow's pattern
  const tomorrowStr = localNow.add(1, 'day').format('YYYY-MM-DD')
  const tomorrowPattern = await prisma.workPattern.findFirst({
    where: {
      sessionId: session.id,
      date: tomorrowStr,
    },
    include: { WorkBlock: true },
  })

  console.log(`\n📅 Tomorrow's Pattern (${tomorrowStr}):`)
  if (!tomorrowPattern) {
    console.log('  ❌ No pattern found')
  } else {
    console.log(`  ✅ Pattern found with ${tomorrowPattern.WorkBlock.length} blocks`)
    let tomorrowTotal = 0
    tomorrowPattern.WorkBlock.forEach(b => {
      const [sh, sm] = b.startTime.split(':').map(Number)
      const [eh, em] = b.endTime.split(':').map(Number)
      const minutes = (eh * 60 + em) - (sh * 60 + sm)
      tomorrowTotal += minutes
      console.log(`    ${b.startTime}-${b.endTime}: ${minutes} minutes (${b.type})`)
    })
    console.log(`  Total: ${tomorrowTotal} minutes`)
  }

  console.log('\n' + '=' .repeat(80))
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
