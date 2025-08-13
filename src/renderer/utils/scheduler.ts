import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { WorkSettings } from '@shared/work-settings-types'

export interface ScheduledItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'lunch'
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
  originalItem?: Task | TaskStep
}

interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step'
  priority: number
  duration: number
  asyncWaitTime: number
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  dependencies?: string[]
  originalItem: Task | TaskStep
}

interface DailyCapacity {
  focusMinutesUsed: number
  adminMinutesUsed: number
  maxFocusMinutes: number
  maxAdminMinutes: number
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return { hours, minutes }
}

function setTimeOnDate(date: Date, timeStr: string): Date {
  const { hours, minutes } = parseTime(timeStr)
  const newDate = new Date(date)
  newDate.setHours(hours, minutes, 0, 0)
  return newDate
}

function getNextWorkTime(currentTime: Date, workSettings: WorkSettings): Date {
  const nextTime = new Date(currentTime)

  // Skip to next work hour if outside work hours
  const dayOfWeek = nextTime.getDay()
  const workHours = workSettings.customWorkHours[dayOfWeek] || workSettings.defaultWorkHours
  const startTime = setTimeOnDate(nextTime, workHours.startTime)
  const endTime = setTimeOnDate(nextTime, workHours.endTime)

  if (nextTime < startTime) {
    return startTime
  } else if (nextTime >= endTime) {
    // Move to next day
    nextTime.setDate(nextTime.getDate() + 1)
    nextTime.setHours(0, 0, 0, 0)

    // Skip weekends
    while (nextTime.getDay() === 0 || nextTime.getDay() === 6) {
      nextTime.setDate(nextTime.getDate() + 1)
    }

    const nextWorkHours = workSettings.customWorkHours[nextTime.getDay()] || workSettings.defaultWorkHours
    return setTimeOnDate(nextTime, nextWorkHours.startTime)
  }

  return nextTime
}

function getBlockedTimesForDay(date: Date, workSettings: WorkSettings): ScheduledItem[] {
  const blockedItems: ScheduledItem[] = []
  const dayOfWeek = date.getDay()
  const dateStr = date.toISOString().split('T')[0]

  // Get work hours for this day
  const workHours = workSettings.customWorkHours[dayOfWeek] || workSettings.defaultWorkHours

  // Add lunch break
  if (workHours.lunchStart && workHours.lunchDuration) {
    const lunchStart = setTimeOnDate(date, workHours.lunchStart)
    const lunchEnd = new Date(lunchStart.getTime() + workHours.lunchDuration * 60000)

    blockedItems.push({
      id: `lunch-${dateStr}`,
      name: '🍽️ Lunch Break',
      type: 'lunch',
      priority: 0,
      duration: workHours.lunchDuration,
      startTime: lunchStart,
      endTime: lunchEnd,
      color: '#9CA3AF',
      isBlocked: true,
    })
  }

  // Add blocked times
  const capacity = workSettings.customCapacity[dateStr] || workSettings.defaultCapacity
  capacity.blockedTimes.forEach(blocked => {
    // Check if this blocked time applies to this day
    if (blocked.recurring === 'none' ||
        blocked.recurring === 'daily' ||
        (blocked.recurring === 'weekly' && blocked.daysOfWeek?.includes(dayOfWeek))) {

      const blockedStart = setTimeOnDate(date, blocked.startTime)
      const blockedEnd = setTimeOnDate(date, blocked.endTime)
      const duration = (blockedEnd.getTime() - blockedStart.getTime()) / 60000

      blockedItems.push({
        id: `blocked-${blocked.id}-${dateStr}`,
        name: `🚫 ${blocked.name}`,
        type: 'blocked-time',
        priority: 0,
        duration,
        startTime: blockedStart,
        endTime: blockedEnd,
        color: '#EF4444',
        isBlocked: true,
      })
    }
  })

  return blockedItems
}

function canScheduleItem(
  startTime: Date,
  duration: number,
  type: 'focused' | 'admin',
  dailyCapacity: DailyCapacity,
  workSettings: WorkSettings,
  scheduledItems: ScheduledItem[],
): boolean {
  // Check capacity limits
  if (type === 'focused') {
    if (dailyCapacity.focusMinutesUsed + duration > dailyCapacity.maxFocusMinutes) {
      return false
    }
  } else {
    if (dailyCapacity.adminMinutesUsed + duration > dailyCapacity.maxAdminMinutes) {
      return false
    }
  }

  // Check for conflicts with blocked times
  const endTime = new Date(startTime.getTime() + duration * 60000)
  const dayBlocked = getBlockedTimesForDay(startTime, workSettings)

  for (const blocked of dayBlocked) {
    // Check if times overlap
    if (!(endTime <= blocked.startTime || startTime >= blocked.endTime)) {
      return false
    }
  }

  // Check for conflicts with already scheduled items
  for (const item of scheduledItems) {
    if (!(endTime <= item.startTime || startTime >= item.endTime)) {
      return false
    }
  }

  return true
}

export function scheduleItems(
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  workSettings: WorkSettings,
  startTime: Date = new Date(),
): ScheduledItem[] {
  const scheduledItems: ScheduledItem[] = []
  const workItems: WorkItem[] = []
  const completedSteps = new Set<string>()
  const asyncWaitEndTimes = new Map<Date, string>() // When async waits end
  const dailyCapacities = new Map<string, DailyCapacity>()
  const blockedDaysAdded = new Set<string>() // Track which days we've added blocked times for

  // Convert all incomplete tasks to work items
  tasks
    .filter(task => !task.completed)
    .forEach(task => {
      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        priority: task.importance * task.urgency,
        duration: task.duration,
        asyncWaitTime: task.asyncWaitTime,
        color: '#6B7280',
        originalItem: task,
      })
    })

  // Convert all workflow steps to work items
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

  // Sort work items by priority (highest first)
  workItems.sort((a, b) => b.priority - a.priority)

  // Schedule items
  let currentTime = getNextWorkTime(new Date(startTime), workSettings)

  // Add blocked times for the first few days
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(currentTime)
    checkDate.setDate(checkDate.getDate() + i)
    if (checkDate.getDay() !== 0 && checkDate.getDay() !== 6) { // Skip weekends
      const dateStr = checkDate.toISOString().split('T')[0]
      if (!blockedDaysAdded.has(dateStr)) {
        blockedDaysAdded.add(dateStr)
        const dayBlocked = getBlockedTimesForDay(checkDate, workSettings)
        scheduledItems.push(...dayBlocked)
      }
    }
  }

  while (workItems.length > 0) {
    // Get current day capacity
    const dateStr = currentTime.toISOString().split('T')[0]
    if (!dailyCapacities.has(dateStr)) {
      const customCapacity = workSettings.customCapacity[dateStr] || workSettings.defaultCapacity
      dailyCapacities.set(dateStr, {
        focusMinutesUsed: 0,
        adminMinutesUsed: 0,
        maxFocusMinutes: customCapacity.maxFocusHours * 60,
        maxAdminMinutes: customCapacity.maxAdminHours * 60,
      })
    }
    const dailyCapacity = dailyCapacities.get(dateStr)!

    // Check if any async waits are completing
    const finishedWaits: Date[] = []
    for (const [endTime, itemId] of asyncWaitEndTimes.entries()) {
      if (endTime <= currentTime) {
        completedSteps.add(itemId)
        finishedWaits.push(endTime)
      }
    }
    finishedWaits.forEach(time => asyncWaitEndTimes.delete(time))

    // Find next schedulable item
    let scheduled = false
    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i]
      if (!item) continue

      // Check if dependencies are met (for workflow steps)
      if (item.dependencies && item.dependencies.length > 0) {
        const allDependenciesMet = item.dependencies.every(dep =>
          completedSteps.has(dep) ||
          // Also check if it's a step reference
          (dep.startsWith('step-') && item.workflowId &&
           completedSteps.has(`${item.workflowId}-step-${dep.replace('step-', '')}`)
          ),
        )
        if (!allDependenciesMet) continue
      }

      // Check if we can schedule this item (capacity and conflicts)
      const itemType = item.originalItem.type
      if (!canScheduleItem(currentTime, item.duration, itemType, dailyCapacity, workSettings, scheduledItems)) {
        continue
      }

      // Schedule this item
      const endTime = new Date(currentTime.getTime() + item.duration * 60000)

      scheduledItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        priority: item.priority,
        duration: item.duration,
        startTime: new Date(currentTime),
        endTime: endTime,
        color: item.color,
        workflowId: item.workflowId,
        workflowName: item.workflowName,
        stepIndex: item.stepIndex,
        originalItem: item.originalItem,
      })

      // Update capacity
      if (itemType === 'focused') {
        dailyCapacity.focusMinutesUsed += item.duration
      } else {
        dailyCapacity.adminMinutesUsed += item.duration
      }

      // If item has async wait time, schedule it
      if (item.asyncWaitTime > 0) {
        const asyncEndTime = new Date(endTime.getTime() + item.asyncWaitTime * 60000)
        asyncWaitEndTimes.set(asyncEndTime, item.id)

        // Add visual indicator for async wait
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
        // Mark as completed immediately if no wait time
        completedSteps.add(item.id)
        if (item.workflowId && item.stepIndex !== undefined) {
          completedSteps.add(`${item.workflowId}-step-${item.stepIndex}`)
        }
      }

      // Remove from work items
      workItems.splice(i, 1)
      scheduled = true

      // Move time forward
      currentTime = endTime
      currentTime = getNextWorkTime(currentTime, workSettings)

      // If we've moved to a new day, add blocked times
      const newDateStr = currentTime.toISOString().split('T')[0]
      if (newDateStr !== dateStr && !blockedDaysAdded.has(newDateStr)) {
        blockedDaysAdded.add(newDateStr)
        const dayBlocked = getBlockedTimesForDay(currentTime, workSettings)
        scheduledItems.push(...dayBlocked)
      }

      break
    }

    // If nothing was scheduled, try next time slot
    if (!scheduled) {
      // Move forward 15 minutes
      currentTime.setMinutes(currentTime.getMinutes() + 15)
      currentTime = getNextWorkTime(currentTime, workSettings)

      // If we've moved to a new day, add blocked times and reset capacity
      const newDateStr = currentTime.toISOString().split('T')[0]
      if (newDateStr !== dateStr && !blockedDaysAdded.has(newDateStr)) {
        blockedDaysAdded.add(newDateStr)
        const dayBlocked = getBlockedTimesForDay(currentTime, workSettings)
        scheduledItems.push(...dayBlocked)
      }

      // Safety check: don't schedule too far in the future
      const maxFutureDate = new Date()
      maxFutureDate.setMonth(maxFutureDate.getMonth() + 1)
      if (currentTime > maxFutureDate) {
        // Scheduling stopped: too far in the future
        break
      }
    }
  }

  return scheduledItems
}
