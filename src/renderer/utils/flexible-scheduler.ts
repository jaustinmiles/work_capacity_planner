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
  const items: ScheduledItem[] = []
  
  meetings.forEach(meeting => {
    let startTime = parseTimeOnDate(date, meeting.startTime)
    let endTime = parseTimeOnDate(date, meeting.endTime)
    
    // Make meeting IDs unique per day
    const dateStr = date.toISOString().split('T')[0]
    const uniqueMeetingId = `${meeting.id}-${dateStr}`
    
    // Handle meetings that cross midnight (like sleep blocks)
    if (endTime <= startTime) {
      // This meeting crosses midnight
      if (meeting.type === 'blocked' && meeting.name === 'Sleep') {
        // For sleep blocks, we need to create two items:
        // 1. From start time to midnight
        const midnight = new Date(date)
        midnight.setDate(midnight.getDate() + 1)
        midnight.setHours(0, 0, 0, 0)
        
        items.push({
          id: `${uniqueMeetingId}-night`,
          name: meeting.name,
          type: meeting.type as any,
          priority: 0,
          duration: (midnight.getTime() - startTime.getTime()) / 60000,
          startTime,
          endTime: midnight,
          color: '#ff4d4f',
          isBlocked: true,
          originalItem: meeting,
        })
        
        // 2. From midnight to end time (current day)
        const prevMidnight = new Date(date)
        prevMidnight.setHours(0, 0, 0, 0)
        const morningEnd = parseTimeOnDate(date, meeting.endTime)
        
        items.push({
          id: `${uniqueMeetingId}-morning`,
          name: meeting.name,
          type: meeting.type as any,
          priority: 0,
          duration: (morningEnd.getTime() - prevMidnight.getTime()) / 60000,
          startTime: prevMidnight,
          endTime: morningEnd,
          color: '#ff4d4f',
          isBlocked: true,
          originalItem: meeting,
        })
      } else {
        // For other meetings crossing midnight, adjust end time to next day
        endTime.setDate(endTime.getDate() + 1)
      }
    }
    
    // Only add the regular item if it's not a sleep block that crosses midnight
    const isSleepBlock = meeting.type === 'blocked' && meeting.name === 'Sleep'
    const crossesMidnight = endTime <= startTime
    
    if (!isSleepBlock || !crossesMidnight) {
      items.push({
        id: uniqueMeetingId,
        name: meeting.name,
        type: meeting.type as any,
        priority: 0,
        duration: (endTime.getTime() - startTime.getTime()) / 60000,
        startTime,
        endTime,
        color: meeting.type === 'meeting' ? '#3370ff' :
               meeting.type === 'break' ? '#00b42a' :
               meeting.type === 'personal' ? '#ff7d00' : '#ff4d4f',
        isBlocked: true,
        originalItem: meeting,
      })
    }
  })
  
  return items
}

function canFitInBlock(
  item: WorkItem,
  block: BlockCapacity,
  currentTime: Date,
  scheduledItems: ScheduledItem[],
): { canFit: boolean; startTime: Date } {
  // Don't count async wait times as conflicts when checking for available slots
  const nonWaitScheduledItems = scheduledItems.filter(s => !s.isWaitTime)
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

    // Check if this time slot conflicts with any scheduled item (excluding async waits)
    const hasConflict = nonWaitScheduledItems.some(scheduled => {
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
    let shouldMoveToNextDay = false

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i]

      // First check if any async waits have completed since we last checked
      const newlyFinishedWaits: Date[] = []
      for (const [endTime, itemId] of asyncWaitEndTimes.entries()) {
        if (endTime <= currentTime) {
          completedSteps.add(itemId)
          newlyFinishedWaits.push(endTime)
        }
      }
      newlyFinishedWaits.forEach(time => asyncWaitEndTimes.delete(time))

      // For workflow steps, we schedule them in sequence regardless of dependencies
      // Dependencies are for execution order, not scheduling order

      // Try to fit in available blocks
      let itemScheduled = false
      for (const block of blockCapacities) {
        const { canFit, startTime } = canFitInBlock(item, block, currentTime, scheduledItems)

        if (canFit) {
          const endTime = new Date(startTime.getTime() + item.duration * 60000)

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
            
            // Update current time to the end of the actual work (not the async wait)
            // This allows other tasks to be scheduled during the async wait time
            currentTime = endTime
          } else {
            // Mark the item as completed using its actual ID
            completedSteps.add(item.id)
            // Update current time to the end of this item
            currentTime = endTime
          }
          
          // If we've scheduled into the next day, update currentDate
          if (currentTime.getDate() !== currentDate.getDate()) {
            currentDate.setTime(currentTime.getTime())
            currentDate.setHours(0, 0, 0, 0)
          }

          // Remove from work items
          workItems.splice(i, 1)
          i-- // Adjust index
          itemsScheduledToday = true
          itemScheduled = true
          break
        }
      }
      
      // If we couldn't schedule this item in any block today, we need to move to next day
      if (!itemScheduled && blockCapacities.length > 0) {
        // Check if currentTime is past all blocks for today
        const lastBlock = blockCapacities[blockCapacities.length - 1]
        if (currentTime.getTime() >= lastBlock.endTime.getTime()) {
          shouldMoveToNextDay = true
          break
        }
      }
    }

    // Check if we should move to the next day
    // Move if: no items scheduled, should move flag is set, or current time is past all blocks
    const lastBlockEnd = blockCapacities.length > 0 
      ? blockCapacities[blockCapacities.length - 1].endTime 
      : new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
      
    if (!itemsScheduledToday || shouldMoveToNextDay || currentTime.getTime() >= lastBlockEnd.getTime()) {
      currentDate.setDate(currentDate.getDate() + 1)
      dayIndex++
      
      // Find the next day's pattern and set currentTime to the start of the first block
      const nextDateStr = currentDate.toISOString().split('T')[0]
      const nextPattern = patterns.find(p => p.date === nextDateStr)
      
      if (nextPattern && nextPattern.blocks.length > 0) {
        // Sort blocks by start time and get the earliest
        const earliestBlock = nextPattern.blocks
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
        currentTime = parseTimeOnDate(currentDate, earliestBlock.startTime)
        
        // If this time is in the past, use current time
        if (currentTime.getTime() < now.getTime()) {
          currentTime = new Date(now)
        }
      } else {
        // No pattern for next day, reset to start of day
        currentTime = new Date(currentDate)
        currentTime.setHours(0, 0, 0, 0)
        if (currentTime.getTime() < now.getTime()) {
          currentTime = new Date(now)
        }
      }
    } else if (itemsScheduledToday && workItems.length > 0) {
      // We scheduled some items but have more to go
      // Check if we need to move to next day based on current time
      const lastBlockEnd = blockCapacities.length > 0 
        ? blockCapacities[blockCapacities.length - 1].endTime 
        : currentTime
        
      if (currentTime.getTime() >= lastBlockEnd.getTime()) {
        currentDate.setDate(currentDate.getDate() + 1)
        dayIndex++
        
        // Find the next day's pattern and set currentTime to the start of the first block
        const nextDateStr = currentDate.toISOString().split('T')[0]
        const nextPattern = patterns.find(p => p.date === nextDateStr)
        
        if (nextPattern && nextPattern.blocks.length > 0) {
          // Sort blocks by start time and get the earliest
          const earliestBlock = nextPattern.blocks
            .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
          currentTime = parseTimeOnDate(currentDate, earliestBlock.startTime)
          
          // If this time is in the past, use current time
          if (currentTime.getTime() < now.getTime()) {
            currentTime = new Date(now)
          }
        } else {
          // No pattern for next day, reset to start of day
          currentTime = new Date(currentDate)
          currentTime.setHours(0, 0, 0, 0)
          if (currentTime.getTime() < now.getTime()) {
            currentTime = new Date(now)
          }
        }
      }
    }
  }

  return scheduledItems
}
