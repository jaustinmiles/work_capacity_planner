#!/usr/bin/env tsx

/**
 * Manual test script for UnifiedScheduler
 * Allows us to execute scheduler methods and verify they work with Node
 */

import { UnifiedScheduler } from '../src/shared/unified-scheduler'
import { Task } from '../src/shared/types'
import { TaskType } from '../src/shared/enums'
import { ScheduleContext, ScheduleConfig } from '../src/shared/unified-scheduler'
import { DailyWorkPattern } from '../src/shared/work-blocks-types'

const scheduler = new UnifiedScheduler()

// Test data
const mockWorkPattern: DailyWorkPattern = {
  date: '2025-01-15',
  blocks: [
    {
      id: 'morning-focus',
      startTime: '09:00',
      endTime: '12:00',
      type: 'focused',
    },
    {
      id: 'afternoon-admin',
      startTime: '13:00',
      endTime: '15:00',
      type: 'admin',
    },
  ],
  accumulated: {
    focusMinutes: 0,
    adminMinutes: 0,
    personalMinutes: 0,
  },
  meetings: [],
}

const mockContext: ScheduleContext = {
  startDate: '2025-01-15',
  currentTime: new Date('2025-01-15T08:00:00.000Z'),
  tasks: [],
  workflows: [],
  workPatterns: [mockWorkPattern],
  workSettings: {
    sleepHours: { start: '23:00', end: '07:00' },
    workingHours: { start: '09:00', end: '17:00' },
    breakPreferences: { duration: 15, frequency: 90 },
    defaultCapacity: {
      maxFocusHours: 4,
      maxAdminHours: 2,
      maxPersonalHours: 1,
    },
  },
}

const mockConfig: ScheduleConfig = {
  startDate: '2025-01-15',
  debugMode: true,
  maxDays: 7,
}

const createTestTask = (id: string, duration: number, options: Partial<Task> = {}): Task => ({
  id,
  name: `Task ${id}`,
  duration,
  importance: 5,
  urgency: 5,
  cognitiveComplexity: 3,
  taskType: TaskType.Focused,
  status: 'not_started',
  createdAt: new Date('2025-01-15T08:00:00.000Z'),
  notes: '',
  ...options,
})

console.log('=== UnifiedScheduler Manual Test ===\n')

// Test 1: Basic priority calculation
console.log('1. Testing priority calculation:')
const testTask = createTestTask('test', 60, { importance: 8, urgency: 7 })
const priority = scheduler.calculatePriority(testTask, mockContext)
const breakdown = scheduler.calculatePriorityWithBreakdown(testTask, mockContext)
console.log(`   Priority: ${priority}`)
console.log('   Breakdown:', breakdown)
console.log()

// Test 2: Topological sort
console.log('2. Testing dependency resolution:')
const dependentTasks = [
  scheduler['convertToUnifiedItems']([
    createTestTask('A', 60),
    createTestTask('B', 45, { dependencies: ['A'] }),
    createTestTask('C', 30, { dependencies: ['A', 'B'] }),
  ]),
].flat()

const sorted = scheduler.topologicalSort(dependentTasks)
console.log(`   Sorted order: ${sorted.map(item => item.id).join(' -> ')}`)
console.log()

// Test 3: Main scheduling
console.log('3. Testing main scheduling:')
const tasks = [
  createTestTask('task1', 60),
  createTestTask('task2', 45, { taskType: TaskType.Admin }),
]

console.log(`   Tasks to schedule: ${tasks.map(t => `${t.name} (${t.duration}min, ${t.taskType})`).join(', ')}`)
console.log(`   Work blocks: ${mockWorkPattern.blocks.map(b => `${b.id} (${b.startTime}-${b.endTime}, ${b.type})`).join(', ')}`)

const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

console.log('\n   Scheduling result:')
console.log(`   - Scheduled: ${result.scheduled.length}`)
console.log(`   - Unscheduled: ${result.unscheduled.length}`)
console.log(`   - Conflicts: ${result.conflicts.length}`)
console.log(`   - Warnings: ${result.warnings.length}`)

if (result.scheduled.length > 0) {
  console.log('\n   Scheduled items:')
  result.scheduled.forEach(item => {
    console.log(`   - ${item.name}: ${item.startTime?.toLocaleTimeString()} - ${item.endTime?.toLocaleTimeString()}`)
  })
}

if (result.unscheduled.length > 0) {
  console.log('\n   Unscheduled items:')
  result.unscheduled.forEach(item => {
    console.log(`   - ${item.name} (${item.duration}min)`)
  })
}

if (result.warnings.length > 0) {
  console.log('\n   Warnings:')
  result.warnings.forEach(warning => {
    console.log(`   - ${warning}`)
  })
}

// Test 4: Available slots detection
console.log('\n4. Testing available slots:')
const availableSlots = scheduler.findAvailableSlots(mockWorkPattern.blocks, 60, TaskType.Focused)
console.log(`   Found ${availableSlots.length} slots for 60min focused task:`)
availableSlots.forEach(slot => {
  console.log(`   - Block ${slot.blockId}: ${slot.startTime.toLocaleTimeString()} - ${slot.endTime.toLocaleTimeString()}`)
})

// Test admin task slots too
const adminSlots = scheduler.findAvailableSlots(mockWorkPattern.blocks, 45, TaskType.Admin)
console.log(`   Found ${adminSlots.length} slots for 45min admin task:`)
adminSlots.forEach(slot => {
  console.log(`   - Block ${slot.blockId}: ${slot.startTime.toLocaleTimeString()} - ${slot.endTime.toLocaleTimeString()}`)
})

// Test direct allocation
console.log('\n   Testing direct allocation:')
const unifiedItems = scheduler['convertToUnifiedItems'](tasks)
console.log(`   Converted items: ${unifiedItems.map(item => `${item.name} (${item.taskType})`).join(', ')}`)

const allocated = scheduler.allocateToWorkBlocks(unifiedItems, [mockWorkPattern], mockConfig)
console.log(`   Direct allocation result: ${allocated.length} items`)
allocated.forEach(item => {
  console.log(`   - ${item.name}: ${item.startTime?.toLocaleTimeString()} - ${item.endTime?.toLocaleTimeString()}`)
})

// Test 5: Async scheduling
console.log('\n5. Testing async scheduling:')
scheduler.scheduleForPersistence(tasks, mockContext, mockConfig).then(asyncResult => {
  console.log(`   Async result: ${asyncResult.scheduled.length} scheduled, ${asyncResult.unscheduled.length} unscheduled`)
  console.log('   Enhanced metrics:')
  console.log(`   - Capacity utilization: ${asyncResult.metrics.capacityUtilization}`)
  console.log(`   - Deadline risk score: ${asyncResult.metrics.deadlineRiskScore}`)

  console.log('\n=== Test Complete ===')
})
