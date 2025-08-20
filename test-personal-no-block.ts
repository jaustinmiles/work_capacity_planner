import { scheduleItemsWithBlocksAndDebug } from './src/renderer/utils/flexible-scheduler'
import { Task } from './src/shared/types'
import { TaskType, TaskCategory } from './src/shared/enums'

// Mock window object for logger
;(global as any).window = {}

// Test data - personal task with NO personal blocks available
const personalTask: Task = {
  id: 'personal-task-1',
  name: 'Personal Task Management App',
  type: TaskType.Focused, // User selected Focused
  category: TaskCategory.Personal, // But category is Personal
  duration: 300, // 5 hours
  importance: 7,
  urgency: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
  completed: false,
  hasSteps: false,
  overallStatus: 'not_started',
  worstCaseDuration: 300,
  criticalPathDuration: 0,
  sessionId: 'test',
}

// Work pattern with NO personal blocks
const workPattern = {
  date: '2025-08-20',
  blocks: [
    {
      id: 'block-1',
      startTime: '09:00',
      endTime: '12:00',
      type: 'focused' as const,
      capacity: {
        focusMinutes: 180,
        adminMinutes: 0,
        personalMinutes: 0,
      },
    },
    {
      id: 'block-2',
      startTime: '14:00',
      endTime: '20:00',
      type: 'focused' as const,  // Another focus block, NOT personal
      capacity: {
        focusMinutes: 360,
        adminMinutes: 0,
        personalMinutes: 0,
      },
    },
  ],
  meetings: [],
}

console.log('Testing personal task WITHOUT personal blocks...')
console.log('Personal task:', {
  name: personalTask.name,
  type: personalTask.type,
  category: personalTask.category,
  duration: personalTask.duration,
})

console.log('\nWork blocks (NO personal blocks):')
workPattern.blocks.forEach(block => {
  console.log(`- ${block.type} block: ${block.startTime}-${block.endTime}`)
  console.log(`  Focus capacity: ${block.capacity?.focusMinutes || 0} minutes`)
})

const result = scheduleItemsWithBlocksAndDebug(
  [personalTask],
  [],
  [workPattern],
  new Date('2025-08-20T08:00:00'),
  { lookAheadDays: 30 },
)

console.log('\nScheduling result:')

if (result && result.scheduledItems) {
  console.log('Scheduled items:', result.scheduledItems.length)

  if (result.scheduledItems.length > 0) {
    console.log('\n❌ BUG: Personal task was scheduled in non-personal block!')
    result.scheduledItems.forEach(item => {
      console.log(`- ${item.name} at ${item.startTime.toLocaleTimeString()}`)
    })
  } else {
    console.log('\n✅ CORRECT: Personal task was NOT scheduled (no personal blocks available)')
    if (result.debugInfo?.unscheduledItems?.length > 0) {
      console.log('Reason:', result.debugInfo.unscheduledItems[0].reason)
    }
  }
}
