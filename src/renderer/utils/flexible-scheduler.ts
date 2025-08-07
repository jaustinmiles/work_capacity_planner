import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { WorkBlock, WorkMeeting, DailyWorkPattern } from '@shared/work-blocks-types'

export interface ScheduledItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'meeting' | 'break'
  priority: number
  duration: number
  startTime: Date
  endTime: Date
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  isWaitTime?: boolean
  isBlocked?: boolean
  deadline?: Date
  originalItem?: Task | TaskStep | WorkMeeting
}

interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step'
  taskType: 'focused' | 'admin'
  priority: number
  duration: number
  asyncWaitTime: number
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  dependencies?: string[]
  deadline?: Date
  originalItem: Task | TaskStep
}

interface BlockCapacity {
  blockId: string
  startTime: Date
  endTime: Date
  focusMinutesTotal: number
  adminMinutesTotal: number
  focusMinutesUsed: number
  adminMinutesUsed: number
}

function parseTimeOnDate(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function getBlockCapacity(block: WorkBlock, date: Date): BlockCapacity {
  const startTime = parseTimeOnDate(date, block.startTime)
  const endTime = parseTimeOnDate(date, block.endTime)
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000

  let focusMinutes = 0
  let adminMinutes = 0

  if (block.capacity) {
    focusMinutes = block.capacity.focusMinutes || 0
    adminMinutes = block.capacity.adminMinutes || 0
  } else if (block.type === 'focused') {
    focusMinutes = durationMinutes
  } else if (block.type === 'admin') {
    adminMinutes = durationMinutes
  } else { // mixed
    focusMinutes = durationMinutes / 2
    adminMinutes = durationMinutes / 2
  }

  return {
    blockId: block.id,
    startTime,
    endTime,
    focusMinutesTotal: focusMinutes,
    adminMinutesTotal: adminMinutes,
    focusMinutesUsed: 0,
    adminMinutesUsed: 0,
  }
}

function getMeetingScheduledItems(meetings: WorkMeeting[], date: Date): ScheduledItem[] {
  return meetings.map(meeting => ({
    id: meeting.id,
    name: meeting.name,
    type: meeting.type as any,
    priority: 0,
    duration: 0, // Will be calculated from times
    startTime: parseTimeOnDate(date, meeting.startTime),
    endTime: parseTimeOnDate(date, meeting.endTime),
    color: meeting.type === 'meeting' ? '#3370ff' :
           meeting.type === 'break' ? '#00b42a' :
           meeting.type === 'personal' ? '#ff7d00' : '#ff4d4f',
    isBlocked: true,
    originalItem: meeting,
  })).map(item => ({
    ...item,
    duration: (item.endTime.getTime() - item.startTime.getTime()) / 60000,
  }))
}

function canFitInBlock(
  item: WorkItem,
  block: BlockCapacity,
  currentTime: Date,
  scheduledItems: ScheduledItem[],
): { canFit: boolean; startTime: Date } {
  // Check capacity
  if (item.taskType === 'focused') {
    if (block.focusMinutesUsed + item.duration > block.focusMinutesTotal) {
      return { canFit: false, startTime: currentTime }
    }
  } else {
    if (block.adminMinutesUsed + item.duration > block.adminMinutesTotal) {
      return { canFit: false, startTime: currentTime }
    }
  }

  // Find next available time in block
  let tryTime = new Date(Math.max(currentTime.getTime(), block.startTime.getTime()))
  const itemEndTime = new Date(tryTime.getTime() + item.duration * 60000)

  // Check if it fits before block ends
  if (itemEndTime > block.endTime) {
    return { canFit: false, startTime: tryTime }
  }

  // Check for conflicts with scheduled items
  while (tryTime < block.endTime) {
    const tryEndTime = new Date(tryTime.getTime() + item.duration * 60000)

    // Check if this time slot conflicts with any scheduled item
    const hasConflict = scheduledItems.some(scheduled => {
      return !(tryEndTime <= scheduled.startTime || tryTime >= scheduled.endTime)
    })

    if (!hasConflict && tryEndTime <= block.endTime) {
      return { canFit: true, startTime: tryTime }
    }

    // Try next 15-minute slot
    tryTime = new Date(tryTime.getTime() + 15 * 60000)
  }

  return { canFit: false, startTime: tryTime }
}

export function scheduleItemsWithBlocks(
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  patterns: DailyWorkPattern[],
  startDate: Date = new Date(),
): ScheduledItem[] {
  console.log('Scheduling with:', {
    tasksCount: tasks.filter(t => !t.completed).length,
    workflowsCount: sequencedTasks.filter(w => w.overallStatus !== 'completed').length,
    patternsCount: patterns.length,
    startDate: startDate.toISOString()
  })
  const scheduledItems: ScheduledItem[] = []
  const workItems: WorkItem[] = []
  const completedSteps = new Set<string>()
  const asyncWaitEndTimes = new Map<Date, string>()

  // Convert tasks to work items
  tasks
    .filter(task => !task.completed)
    .forEach(task => {
      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        taskType: task.type as 'focused' | 'admin',
        priority: task.importance * task.urgency,
        duration: task.duration,
        asyncWaitTime: task.asyncWaitTime,
        color: '#6B7280',
        deadline: task.deadline,
        originalItem: task,
      })
    })

  // Convert workflow steps to work items
  sequencedTasks
    .filter(workflow => workflow.overallStatus !== 'completed')
    .forEach((workflow, wIndex) => {
      const workflowColor = `hsl(${wIndex * 60}, 70%, 50%)`

      workflow.steps
        .filter(step => step.status !== 'completed')
        .forEach((step, stepIndex) => {
          workItems.push({
            id: step.id,
            name: `[${workflow.name}] ${step.name}`,
            type: 'workflow-step',
            taskType: step.type as 'focused' | 'admin',
            priority: workflow.importance * workflow.urgency,
            duration: step.duration,
            asyncWaitTime: step.asyncWaitTime,
            color: workflowColor,
            workflowId: workflow.id,
            workflowName: workflow.name,
            stepIndex,
            dependencies: step.dependsOn,
            originalItem: step,
          })
        })
    })

  // Sort by deadline urgency and priority
  workItems.sort((a, b) => {
    // First check if either has a deadline
    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity

    const now = new Date().getTime()
    const oneDayMs = 24 * 60 * 60 * 1000

    // If both have deadlines within 24 hours, prioritize the earlier one
    if (aDeadline - now < oneDayMs && bDeadline - now < oneDayMs) {
      return aDeadline - bDeadline
    }

    // If only one has a deadline within 24 hours, prioritize it
    if (aDeadline - now < oneDayMs) return -1
    if (bDeadline - now < oneDayMs) return 1

    // Otherwise sort by priority score
    return b.priority - a.priority
  })

  // Process each day
  const now = new Date()
  const currentDate = new Date(startDate)
  currentDate.setHours(0, 0, 0, 0)
  let currentTime = new Date(Math.max(startDate.getTime(), now.getTime())) // Don't schedule in the past
  let dayIndex = 0
  const maxDays = 30 // Limit to 30 days

  while (workItems.length > 0 && dayIndex < maxDays) {
    const dateStr = currentDate.toISOString().split('T')[0]
    const pattern = patterns.find(p => p.date === dateStr)
    console.log(`Processing day ${dateStr}, pattern found:`, !!pattern, 'Current time:', currentTime.toISOString())

    if (!pattern || pattern.blocks.length === 0) {
      // No pattern for this day, skip to next day
      currentDate.setDate(currentDate.getDate() + 1)
      currentTime = new Date(currentDate)
      currentTime.setHours(0, 0, 0, 0)
      // If we've moved to tomorrow, ensure currentTime is not in the past
      if (currentTime.getTime() < now.getTime()) {
        currentTime = new Date(now)
      }
      dayIndex++
      continue
    }

    // Add meetings/blocked times for this day
    const dayMeetings = getMeetingScheduledItems(pattern.meetings, currentDate)
    scheduledItems.push(...dayMeetings)

    // Create block capacities
    const blockCapacities = pattern.blocks.map(block => getBlockCapacity(block, currentDate))

    // Check if any async waits are completing
    const finishedWaits: Date[] = []
    for (const [endTime, itemId] of asyncWaitEndTimes.entries()) {
      if (endTime <= currentTime) {
        completedSteps.add(itemId)
        finishedWaits.push(endTime)
      }
    }
    finishedWaits.forEach(time => asyncWaitEndTimes.delete(time))

    // Try to schedule items in this day's blocks
    let itemsScheduledToday = false
    console.log(`Trying to schedule ${workItems.length} items in ${blockCapacities.length} blocks`)

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i]

      // Check dependencies
      if (item.dependencies && item.dependencies.length > 0) {
        const allDependenciesMet = item.dependencies.every(dep => {
          // Direct check for the dependency ID
          return completedSteps.has(dep)
        })
        if (!allDependenciesMet) continue
      }

      // Try to fit in available blocks
      for (const block of blockCapacities) {
        const { canFit, startTime } = canFitInBlock(item, block, currentTime, scheduledItems)
        console.log(`Block ${block.blockId}: canFit=${canFit}, currentTime=${currentTime.toISOString()}, blockStart=${block.startTime.toISOString()}, blockEnd=${block.endTime.toISOString()}`)

        if (canFit) {
          const endTime = new Date(startTime.getTime() + item.duration * 60000)
          console.log(`Scheduling item '${item.name}' from ${startTime.toISOString()} to ${endTime.toISOString()}`)

          // Schedule the item
          scheduledItems.push({
            id: item.id,
            name: item.name,
            type: item.type,
            priority: item.priority,
            duration: item.duration,
            startTime,
            endTime,
            color: item.color,
            workflowId: item.workflowId,
            workflowName: item.workflowName,
            stepIndex: item.stepIndex,
            deadline: item.deadline,
            originalItem: item.originalItem,
          })

          // Update block capacity
          if (item.taskType === 'focused') {
            block.focusMinutesUsed += item.duration
          } else {
            block.adminMinutesUsed += item.duration
          }

          // Handle async wait time
          if (item.asyncWaitTime > 0) {
            const asyncEndTime = new Date(endTime.getTime() + item.asyncWaitTime * 60000)
            asyncWaitEndTimes.set(asyncEndTime, item.id)

            scheduledItems.push({
              id: `${item.id}-wait`,
              name: `⏳ Waiting: ${item.name}`,
              type: 'async-wait',
              priority: item.priority,
              duration: item.asyncWaitTime,
              startTime: endTime,
              endTime: asyncEndTime,
              color: item.color,
              workflowId: item.workflowId,
              workflowName: item.workflowName,
              isWaitTime: true,
              originalItem: item.originalItem,
            })
          } else {
            // Mark the item as completed using its actual ID
            completedSteps.add(item.id)
          }

          // Update current time
          currentTime = endTime

          // Remove from work items
          workItems.splice(i, 1)
          i-- // Adjust index
          itemsScheduledToday = true
          break
        }
      }
    }

    // If nothing was scheduled today, move to next day
    if (!itemsScheduledToday) {
      currentDate.setDate(currentDate.getDate() + 1)
      currentTime = new Date(currentDate)
      currentTime.setHours(0, 0, 0, 0)
      // If we've moved to tomorrow, ensure currentTime is not in the past
      if (currentTime.getTime() < now.getTime()) {
        currentTime = new Date(now)
      }
      dayIndex++
      console.log(`No items scheduled today, moving to next day: ${currentDate.toISOString()}`)
    }
  }

  console.log(`Scheduling complete. Total items scheduled: ${scheduledItems.length}`)
  return scheduledItems
}
