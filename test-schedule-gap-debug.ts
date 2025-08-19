import { scheduleItemsWithBlocksAndDebug } from './src/renderer/utils/flexible-scheduler'
import { Task } from './src/shared/types'
import { TaskType } from './src/shared/enums'
import { DailyWorkPattern } from './src/shared/work-blocks-types'

// Test multiple times to see pattern
const testTimes = [
  new Date('2025-08-19T21:00:00'), // 9 PM
  new Date('2025-08-19T14:00:00'), // 2 PM
  new Date('2025-08-19T09:00:00'), // 9 AM
]

testTimes.forEach(now => {
  const today = now.toISOString().split('T')[0]

  const task: Task = {
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    type: TaskType.Focused,
    importance: 8,
    urgency: 8,
    completed: false,
    dependencies: [],
    asyncWaitTime: 0,
    sessionId: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: 60,
    worstCaseDuration: 60,
  } as Task

  const pattern: DailyWorkPattern = {
    date: today,
    blocks: [{
      id: 'all-day',
      startTime: '08:00',
      endTime: '23:00',
      type: 'mixed',
      capacity: {
        focusMinutes: 900,
        adminMinutes: 0,
        personalMinutes: 0,
      },
    }],
    meetings: [],
    accumulated: { focusMinutes: 0, adminMinutes: 0 },
  }

  console.log('\n=== Test with current time:', now.toLocaleTimeString(), '===')
  console.log('Block:', pattern.blocks[0].startTime, '-', pattern.blocks[0].endTime)

  const result = scheduleItemsWithBlocksAndDebug([task], [], [pattern], now)

  if (result.scheduledItems.length > 0) {
    const item = result.scheduledItems[0]
    const scheduledTime = new Date(item.startTime)
    console.log('Task scheduled at:', scheduledTime.toLocaleTimeString())
    
    const expectedGap = scheduledTime.getTime() - now.getTime()
    const gapMinutes = Math.floor(expectedGap / 60000)
    
    if (scheduledTime < now) {
      console.log('ERROR: Scheduled in the past!')
    } else if (gapMinutes > 15) {
      console.log(`WARNING: Large gap of ${gapMinutes} minutes`)
    } else {
      console.log('✓ Scheduled correctly')
    }
  } else {
    console.log('ERROR: Task not scheduled!')
  }
})