import { scheduleItemsWithBlocksAndDebug } from './src/renderer/utils/flexible-scheduler'
import { Task } from './src/shared/types'
import { TaskType } from './src/shared/enums'
import { DailyWorkPattern } from './src/shared/work-blocks-types'

// Simulate current time being in the middle of a block
const now = new Date()
const today = now.toISOString().split('T')[0]

// Create a block that started 2 hours ago and ends in 2 hours
const blockStart = new Date(now)
blockStart.setHours(now.getHours() - 2)
const blockEnd = new Date(now)
blockEnd.setHours(now.getHours() + 2)

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
    id: 'current-block',
    startTime: `${blockStart.getHours().toString().padStart(2, '0')}:00`,
    endTime: `${blockEnd.getHours().toString().padStart(2, '0')}:00`,
    type: 'mixed',
    capacity: {
      focusMinutes: 240,
      adminMinutes: 0,
      personalMinutes: 0,
    },
  }],
  meetings: [],
  accumulated: { focusMinutes: 0, adminMinutes: 0 },
}

console.log('Testing schedule with:')
console.log('Current time:', now.toLocaleTimeString())
console.log('Block:', pattern.blocks[0].startTime, '-', pattern.blocks[0].endTime)

const result = scheduleItemsWithBlocksAndDebug([task], [], [pattern], now)

console.log('\nResult:')
console.log('Scheduled items:', result.scheduledItems.length)
if (result.scheduledItems.length > 0) {
  const item = result.scheduledItems[0]
  console.log('Task scheduled at:', new Date(item.startTime).toLocaleTimeString())
  console.log('Should be close to current time:', now.toLocaleTimeString())
  
  const gap = new Date(item.startTime).getTime() - now.getTime()
  const gapMinutes = Math.floor(gap / 60000)
  console.log('Gap from current time:', gapMinutes, 'minutes')
  
  if (gapMinutes > 15) {
    console.log('WARNING: Large gap detected!')
  }
} else {
  console.log('ERROR: Task not scheduled!')
  console.log('Unscheduled:', result.debugInfo.unscheduledItems)
}