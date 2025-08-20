import { scheduleItemsWithBlocksAndDebug } from './src/renderer/utils/flexible-scheduler'
import { Task } from './src/shared/types'
import { TaskType, TaskCategory } from './src/shared/enums'

// Test data
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
      type: 'personal' as const,
      capacity: {
        focusMinutes: 0,
        adminMinutes: 0,
        personalMinutes: 360,
      },
    },
  ],
  meetings: [],
}

console.log('Testing personal task scheduling...')
console.log('Personal task:', {
  name: personalTask.name,
  type: personalTask.type,
  category: personalTask.category,
  duration: personalTask.duration,
})

console.log('\nWork blocks:')
workPattern.blocks.forEach(block => {
  console.log(`- ${block.type} block: ${block.startTime}-${block.endTime}`)
  if (block.type === 'personal') {
    console.log(`  Personal capacity: ${block.capacity?.personalMinutes || 0} minutes`)
  } else if (block.type === 'focused') {
    console.log(`  Focus capacity: ${block.capacity?.focusMinutes || 0} minutes`)
  }
})

const result = scheduleItemsWithBlocksAndDebug(
  [personalTask],
  [],
  [workPattern],
  new Date('2025-08-20T08:00:00'),
  { lookAheadDays: 30 },
)

console.log('\nScheduling result:')
console.log('Result object:', result)

if (!result) {
  console.log('❌ Function returned undefined!')
} else if (result.scheduledItems) {
  console.log('Scheduled items:', result.scheduledItems.length)

  if (result.scheduledItems.length > 0) {
    console.log('\n✅ Personal task was scheduled!')
    result.scheduledItems.forEach(item => {
      console.log(`- ${item.name} at ${item.startTime.toLocaleTimeString()}`)
    })
  } else {
    console.log('\n❌ Personal task was NOT scheduled')
    console.log('Debug info:', result.debugInfo?.unscheduledItems)
  }
}
