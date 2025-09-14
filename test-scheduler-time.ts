import { UnifiedScheduler } from './src/shared/unified-scheduler'
import { Task, TaskType } from './src/shared/types'
import { DailyWorkPattern } from './src/shared/work-blocks-types'

// Create a test task
const testTask: Task = {
  id: 'test-1',
  name: 'Test Task',
  duration: 60,
  type: TaskType.Focus,
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
}

// Create work pattern for today (Sep 13) with a block from 9am to 11:55pm
const todayPattern: DailyWorkPattern = {
  date: '2025-09-13',
  isWorkday: true,
  blocks: [{
    id: 'block-1',
    start: '09:00',
    end: '23:55',
    type: 'flexible',
    capacity: {
      focusMinutes: 240,
      adminMinutes: 120,
      personalMinutes: 60,
    }
  }],
  meetings: [],
  effectiveCapacity: {
    focusMinutes: 240,
    adminMinutes: 120,
    personalMinutes: 60,
  }
}

// Create work pattern for tomorrow (Sep 14)
const tomorrowPattern: DailyWorkPattern = {
  date: '2025-09-14',
  isWorkday: true,
  blocks: [{
    id: 'block-2',
    start: '09:00',
    end: '17:00',
    type: 'flexible',
    capacity: {
      focusMinutes: 240,
      adminMinutes: 120,
      personalMinutes: 60,
    }
  }],
  meetings: [],
  effectiveCapacity: {
    focusMinutes: 240,
    adminMinutes: 120,
    personalMinutes: 60,
  }
}

// Test scheduling with current time (Sep 13, 10:50pm)
const currentTime = new Date('2025-09-13T22:50:00')
console.log('Current time:', currentTime.toISOString())

const scheduler = new UnifiedScheduler()
const result = scheduler.schedule({
  tasks: [testTask],
  workflows: [],
  workPatterns: [todayPattern, tomorrowPattern],
  startDate: '2025-09-13',
  currentTime,
  debugMode: true,
})

console.log('\n=== SCHEDULING RESULT ===')
console.log('Scheduled tasks:', result.scheduled.length)
console.log('Unscheduled tasks:', result.unscheduled.length)

if (result.scheduled.length > 0) {
  const scheduled = result.scheduled[0]
  console.log('\nScheduled task details:')
  console.log('- Name:', scheduled.name)
  console.log('- Start time:', scheduled.startTime?.toISOString())
  console.log('- End time:', scheduled.endTime?.toISOString())
  console.log('- Date:', scheduled.startTime?.toISOString().split('T')[0])
  
  // Check if it's scheduled today (Sep 13) at 10:50pm or later
  if (scheduled.startTime) {
    const isToday = scheduled.startTime.toISOString().startsWith('2025-09-13')
    const isAfterCurrentTime = scheduled.startTime >= currentTime
    console.log('\n✓ Scheduled on Sep 13?', isToday)
    console.log('✓ Scheduled after current time (22:50)?', isAfterCurrentTime)
    
    if (isToday && isAfterCurrentTime) {
      console.log('\n✅ SUCCESS: Task correctly scheduled in current work block!')
    } else if (!isToday) {
      console.log('\n❌ FAILURE: Task scheduled on wrong day (should be Sep 13)')
    } else {
      console.log('\n❌ FAILURE: Task scheduled in the past')
    }
  }
} else {
  console.log('\n❌ FAILURE: No tasks were scheduled')
}
