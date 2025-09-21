#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'
import { unifiedScheduler } from '../../src/shared/unified-scheduler'
import { getCurrentTime } from '../../src/shared/time-provider'
import dayjs from 'dayjs'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('DEBUG UNIFIED SCHEDULER WITH HALEIGH TASKS')
  console.log('=' .repeat(80))

  const now = getCurrentTime()
  const dateStr = dayjs(now).format('YYYY-MM-DD')

  // Get Haleigh session tasks
  const session = await prisma.session.findFirst({
    where: { name: 'Haleigh 9/13' },
    include: {
      Task: {
        where: { completed: false },
      },
    },
  })

  if (!session) {
    console.error('Session not found!')
    return
  }

  console.log('\n📋 Tasks to schedule:')
  session.Task.forEach(t => {
    console.log(`  - ${t.name}: ${t.duration}min (${t.type})`)
  })

  // Get work pattern
  const pattern = await prisma.workPattern.findFirst({
    where: { date: dateStr },
    include: { WorkBlock: true },
  })

  const workPattern = pattern ? {
    date: pattern.date,
    isWorkday: true,
    blocks: pattern.WorkBlock.map(b => ({
      id: b.id,
      start: b.startTime,
      end: b.endTime,
      type: b.type as any,
    })),
    meetings: [],
    effectiveCapacity: {
      focusMinutes: 895,
      adminMinutes: 895,
      personalMinutes: 0,
    },
  } : null

  console.log('\n📅 Work Pattern:')
  if (workPattern) {
    console.log(`  Date: ${workPattern.date}`)
    console.log(`  Blocks: ${workPattern.blocks.length}`)
    workPattern.blocks.forEach(b => {
      console.log(`    ${b.start} - ${b.end} (${b.type})`)
    })
  } else {
    console.log('  ❌ No pattern!')
  }

  console.log('\n🚀 Running UnifiedScheduler.schedule()...')

  try {
    const result = unifiedScheduler.schedule({
      tasks: session.Task,
      workflows: [],
      workPatterns: workPattern ? [workPattern] : [],
      startDate: dateStr,
      currentTime: now,
      debugMode: true,
    })

    console.log('\n📊 RESULTS:')
    console.log(`  Scheduled: ${result.scheduled.length}`)
    console.log(`  Unscheduled: ${result.unscheduled.length}`)

    if (result.scheduled.length > 0) {
      console.log('\n✅ Scheduled:')
      result.scheduled.forEach((item, i) => {
        console.log(`  ${i+1}. ${item.name}`)
        console.log(`     Start: ${item.startTime?.toLocaleTimeString() || 'unknown'}`)
      })
    }

    if (result.unscheduled.length > 0) {
      console.log('\n❌ Unscheduled:')
      result.unscheduled.forEach((item, i) => {
        console.log(`  ${i+1}. ${item.name}: ${item.reason || 'No reason given'}`)
      })
    }

  } catch (error) {
    console.error('\n❌ Scheduler error:', error)
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
