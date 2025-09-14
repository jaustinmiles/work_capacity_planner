#!/usr/bin/env npx tsx
/**
 * Deep dive into scheduler allocation to understand why tasks stop at 2 hours
 */

import { unifiedScheduler } from '../src/shared/unified-scheduler'
import { Task } from '../src/shared/types'
import { TaskType } from '../src/shared/enums'
import { DailyWorkPattern } from '../src/shared/work-blocks-types'
import { getCurrentTime } from '../src/shared/time-provider'

// Create test tasks
const testTasks: Task[] = [
  {
    id: 'task-1',
    name: 'First Task',
    duration: 30,
    type: TaskType.Focused,
    importance: 5,
    urgency: 5,
    startedAt: null,
    completedAt: null,
    tagIds: [],
    workflowId: null,
    voiceNotes: [],
    dependencies: [],
    blockedBy: [],
    blocking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'task-2',
    name: 'Second Task',
    duration: 45,
    type: TaskType.Admin,
    importance: 4,
    urgency: 4,
    startedAt: null,
    completedAt: null,
    tagIds: [],
    workflowId: null,
    voiceNotes: [],
    dependencies: [],
    blockedBy: [],
    blocking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'task-3',
    name: 'Third Task',
    duration: 60,
    type: TaskType.Focused,
    importance: 3,
    urgency: 3,
    startedAt: null,
    completedAt: null,
    tagIds: [],
    workflowId: null,
    voiceNotes: [],
    dependencies: [],
    blockedBy: [],
    blocking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// Create work pattern for Sep 14
const pattern: DailyWorkPattern = {
  date: '2025-09-14',
  isWorkday: true,
  blocks: [{
    id: 'block-1',
    start: '09:00',
    end: '23:55',
    type: 'flexible',
    capacity: undefined, // Should calculate to 895 minutes each
  }],
  meetings: [],
  effectiveCapacity: {
    focusMinutes: 895,
    adminMinutes: 895,
    personalMinutes: 0,
  },
}

async function main() {
  console.log('=' .repeat(80))
  console.log('SCHEDULER DEEP DIVE')
  console.log('=' .repeat(80))

  const currentTime = getCurrentTime()
  console.log('\n📅 Current Time:', currentTime.toISOString())
  console.log('📅 Local Time:', currentTime.toLocaleString())

  console.log('\n📋 Test Tasks:')
  testTasks.forEach(t => {
    console.log(`  - ${t.name}: ${t.duration}min (${t.type})`)
  })
  const totalDuration = testTasks.reduce((sum, t) => sum + t.duration, 0)
  console.log(`  Total: ${totalDuration} minutes`)

  console.log('\n📦 Work Pattern:')
  console.log(`  Date: ${pattern.date}`)
  console.log(`  Block: ${pattern.blocks[0].start} - ${pattern.blocks[0].end}`)
  console.log(`  Type: ${pattern.blocks[0].type}`)
  console.log(`  Effective Capacity:`, pattern.effectiveCapacity)

  console.log('\n🚀 Running Scheduler...')
  console.log('=' .repeat(40))

  // Enable console.log interception to capture scheduler logs
  const originalLog = console.log
  const logs: string[] = []
  console.log = (...args) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
    logs.push(message)
    originalLog(...args)
  }

  const result = unifiedScheduler.schedule({
    tasks: testTasks,
    workflows: [],
    workPatterns: [pattern],
    startDate: pattern.date,
    currentTime,
    debugMode: true,
  })

  // Restore console.log
  console.log = originalLog

  console.log('\n' + '=' .repeat(40))
  console.log('📊 RESULTS:')
  console.log(`  Scheduled: ${result.scheduled.length} tasks`)
  console.log(`  Unscheduled: ${result.unscheduled.length} tasks`)

  if (result.scheduled.length > 0) {
    console.log('\n✅ Scheduled Tasks:')
    result.scheduled.forEach(item => {
      const start = item.startTime?.toLocaleTimeString() || 'unknown'
      const end = item.endTime?.toLocaleTimeString() || 'unknown'
      console.log(`  - ${item.name}: ${start} - ${end}`)
    })
  }

  if (result.unscheduled.length > 0) {
    console.log('\n❌ Unscheduled Tasks:')
    result.unscheduled.forEach(item => {
      console.log(`  - ${item.name}: ${item.duration}min`)
    })
  }

  // Analyze scheduler logs for capacity issues
  console.log('\n🔍 Analyzing Scheduler Logs for Capacity Issues:')
  const capacityLogs = logs.filter(log =>
    log.includes('capacity') ||
    log.includes('Capacity') ||
    log.includes('available') ||
    log.includes('canFit')
  )

  if (capacityLogs.length > 0) {
    console.log('Found capacity-related logs:')
    capacityLogs.slice(0, 10).forEach(log => {
      if (log.includes('57')) {
        console.log('  ⚠️', log.substring(0, 100))
      } else {
        console.log('  -', log.substring(0, 100))
      }
    })
  }

  // Check what's limiting the scheduling
  console.log('\n🚨 Potential Issues:')
  if (result.scheduled.length === 0) {
    console.log('  - No tasks scheduled at all!')
  } else if (result.scheduled.length < testTasks.length) {
    console.log('  - Not all tasks scheduled')
    const lastScheduled = result.scheduled[result.scheduled.length - 1]
    if (lastScheduled.endTime) {
      console.log(`  - Last task ends at: ${lastScheduled.endTime.toLocaleTimeString()}`)
      const blockEnd = new Date(`2025-09-14T23:55:00`)
      const remainingMinutes = Math.floor((blockEnd.getTime() - lastScheduled.endTime.getTime()) / 60000)
      console.log(`  - Remaining time in block: ${remainingMinutes} minutes`)
    }
  }

  console.log('\n' + '=' .repeat(80))
}

main().catch(console.error)