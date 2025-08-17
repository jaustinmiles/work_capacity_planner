import { Task, ProductivityPattern, SchedulingPreferences } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { WorkBlock, WorkMeeting, DailyWorkPattern } from '@shared/work-blocks-types'
import { WorkSettings } from '@shared/work-settings-types'
import { calculatePriority, calculateDeadlinePressure, calculateAsyncUrgency, SchedulingContext } from './deadline-scheduler'

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

export interface SchedulingDebugInfo {
  unscheduledItems: Array<{
    name: string
    type: string
    duration: number
    reason: string
  }>
  blockUtilization: Array<{
    date: string
    blockId: string
    startTime: string
    endTime: string
    focusUsed: number
    focusTotal: number
    adminUsed: number
    adminTotal: number
    unusedReason?: string
  }>
  warnings: string[]
  asyncDependencies?: string[]
  missingDependencies?: string[]
  pendingDependencies?: string[]
}

interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step'
  taskType: 'focused' | 'admin'
  category?: 'work' | 'personal'
  priority: number
  duration: number
  asyncWaitTime: number
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  dependencies?: string[]
  deadline?: Date
  isLocked?: boolean
  lockedStartTime?: Date
  originalItem: Task | TaskStep
}

interface BlockCapacity {
  blockId: string
  startTime: Date
  endTime: Date
  blockType: 'focused' | 'admin' | 'mixed' | 'personal'
  focusMinutesTotal: number
  adminMinutesTotal: number
  personalMinutesTotal: number
  focusMinutesUsed: number
  adminMinutesUsed: number
  personalMinutesUsed: number
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
  let personalMinutes = 0

  if (block.capacity) {
    focusMinutes = block.capacity.focusMinutes || 0
    adminMinutes = block.capacity.adminMinutes || 0
    personalMinutes = block.capacity.personalMinutes || 0
  } else if (block.type === 'focused') {
    focusMinutes = durationMinutes
  } else if (block.type === 'admin') {
    adminMinutes = durationMinutes
  } else if (block.type === 'personal') {
    personalMinutes = durationMinutes
  } else { // mixed
    focusMinutes = durationMinutes / 2
    adminMinutes = durationMinutes / 2
  }

  return {
    blockId: block.id,
    startTime,
    endTime,
    blockType: block.type,
    focusMinutesTotal: focusMinutes,
    adminMinutesTotal: adminMinutes,
    personalMinutesTotal: personalMinutes,
    focusMinutesUsed: 0,
    adminMinutesUsed: 0,
    personalMinutesUsed: 0,
  }
}

function getMeetingScheduledItems(meetings: WorkMeeting[], date: Date): ScheduledItem[] {
  const items: ScheduledItem[] = []
  const meetingMap = new Map<string, number>()

  meetings.forEach((meeting, index) => {
    const startTime = parseTimeOnDate(date, meeting.startTime)
    const endTime = parseTimeOnDate(date, meeting.endTime)

    // Make meeting IDs unique per day - use a counter for each meeting ID
    const dateStr = date.toISOString().split('T')[0]
    const baseId = `${meeting.id}-${dateStr}`
    const count = meetingMap.get(baseId) || 0
    meetingMap.set(baseId, count + 1)
    const uniqueMeetingId = count > 0 ? `${baseId}-${count}` : baseId

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
          type: meeting.type as 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'meeting' | 'break',
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
          type: meeting.type as 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'meeting' | 'break',
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
        type: meeting.type as 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'meeting' | 'break',
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

  // Check category compatibility
  const isPersonalTask = item.category === 'personal'
  const isPersonalBlock = block.blockType === 'personal'

  // Personal tasks can only go in personal blocks
  if (isPersonalTask && !isPersonalBlock) {
    return { canFit: false, startTime: currentTime }
  }

  // Work tasks (or tasks without category) cannot go in personal blocks
  if (!isPersonalTask && isPersonalBlock) {
    return { canFit: false, startTime: currentTime }
  }

  // Check capacity based on task category
  if (isPersonalTask) {
    if (block.personalMinutesUsed + item.duration > block.personalMinutesTotal) {
      return { canFit: false, startTime: currentTime }
    }
  } else if (item.taskType === 'focused') {
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

export interface SchedulingOptions {
  productivityPatterns?: ProductivityPattern[]
  schedulingPreferences?: SchedulingPreferences
  workSettings?: WorkSettings
}

export function scheduleItemsWithBlocks(
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  patterns: DailyWorkPattern[],
  startDate: Date = new Date(),
  options: SchedulingOptions = {},
): ScheduledItem[] {
  const result = scheduleItemsWithBlocksAndDebug(tasks, sequencedTasks, patterns, startDate, options)
  return result.scheduledItems
}

export function scheduleItemsWithBlocksAndDebug(
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  patterns: DailyWorkPattern[],
  startDate: Date = new Date(),
  options: SchedulingOptions = {},
): { scheduledItems: ScheduledItem[], debugInfo: SchedulingDebugInfo } {
  // Consistency check: Warn if workflows appear in both arrays
  const workflowIds = new Set(sequencedTasks.map(w => w.id))
  const duplicateWorkflows = tasks.filter(t => t.hasSteps && workflowIds.has(t.id))

  if (duplicateWorkflows.length > 0) {
    console.warn(
      `⚠️ Scheduler Warning: ${duplicateWorkflows.length} workflows found in both tasks and sequencedTasks arrays. ` +
      'This will cause duplicate scheduling! Workflows should only be in sequencedTasks. ' +
      `Duplicates: ${duplicateWorkflows.map(w => w.name).join(', ')}`,
    )
  }
  const scheduledItems: ScheduledItem[] = []
  let workItems: WorkItem[] = []
  const completedSteps = new Set<string>()
  const asyncWaitEndTimes = new Map<Date, string>()
  const workflowProgress = new Map<string, number>() // Track how many steps scheduled per workflow

  // Debug tracking
  const debugInfo: SchedulingDebugInfo = {
    unscheduledItems: [],
    blockUtilization: [],
    warnings: [],
  }

  // ASSERTION: Validate inputs
  if (!patterns || patterns.length === 0) {
    debugInfo.warnings.push('No work patterns provided - cannot schedule any items')
    return { scheduledItems: [], debugInfo }
  }

  // ASSERTION: Check for duplicate IDs
  const allIds = new Set<string>()
  tasks.forEach(t => {
    if (allIds.has(t.id)) {
      debugInfo.warnings.push(`Duplicate task ID detected: ${t.id}`)
    }
    allIds.add(t.id)
  })

  sequencedTasks.forEach(st => {
    st.steps.forEach(step => {
      if (allIds.has(step.id)) {
        debugInfo.warnings.push(`Duplicate step ID detected: ${step.id}`)
      }
      allIds.add(step.id)
    })
  })

  // Create scheduling context for enhanced priority if options provided
  const schedulingContext: SchedulingContext | null = options.schedulingPreferences && options.workSettings ? {
    tasks,
    workflows: sequencedTasks,
    workPatterns: patterns,
    productivityPatterns: options.productivityPatterns || [],
    schedulingPreferences: options.schedulingPreferences,
    workSettings: options.workSettings,
    currentTime: startDate,
    lastScheduledItem: undefined,
  } : null

  // Convert tasks to work items
  tasks
    .filter(task => !task.completed)
    .forEach(task => {
      // Calculate priority using enhanced function if context available
      const priority = schedulingContext
        ? calculatePriority(task, schedulingContext)
        : task.importance * task.urgency

      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        taskType: task.type as 'focused' | 'admin',
        category: task.category || 'work',
        priority,
        duration: task.duration,
        asyncWaitTime: task.asyncWaitTime,
        color: task.category === 'personal' ? '#9333EA' : '#6B7280',
        deadline: task.deadline,
        isLocked: task.isLocked,
        lockedStartTime: task.lockedStartTime,
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
          // Calculate priority using enhanced function if context available
          // For steps, we use the workflow's importance/urgency as base
          const basePriority = workflow.importance * workflow.urgency
          const priority = schedulingContext
            ? calculatePriority({
                ...step,
                importance: workflow.importance,
                urgency: workflow.urgency,
                sessionId: workflow.sessionId || 'default',
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
                completed: false,
                dependencies: step.dependsOn,
                hasSteps: false,
                overallStatus: 'not_started',
                criticalPathDuration: 0,
                worstCaseDuration: 0,
              } as Task, schedulingContext)
            : basePriority

          workItems.push({
            id: step.id,
            name: `[${workflow.name}] ${step.name}`,
            type: 'workflow-step',
            taskType: step.type as 'focused' | 'admin',
            category: workflow.category || 'work', // Add category from workflow
            priority,
            duration: step.duration,
            asyncWaitTime: step.asyncWaitTime,
            color: workflowColor,
            workflowId: workflow.id,
            workflowName: workflow.name,
            stepIndex,
            dependencies: step.dependsOn || [],
            originalItem: step,
          })
        })
    })

  // Helper function to perform topological sort on work items with dependencies
  function topologicalSort(items: WorkItem[]): WorkItem[] {
    const sorted: WorkItem[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const itemMap = new Map<string, WorkItem>()

    // Build item map for quick lookup
    items.forEach(item => itemMap.set(item.id, item))

    function visit(item: WorkItem): void {
      if (visited.has(item.id)) return
      if (visiting.has(item.id)) {
        // Circular dependency detected - just skip
        debugInfo.warnings.push(`Circular dependency detected involving ${item.name}`)
        return
      }

      visiting.add(item.id)

      // Visit dependencies first
      if (item.dependencies && item.dependencies.length > 0) {
        for (const depId of item.dependencies) {
          const dep = itemMap.get(depId)
          if (dep) {
            visit(dep)
          }
        }
      }

      visiting.delete(item.id)
      visited.add(item.id)
      sorted.push(item)
    }

    // Visit all items
    items.forEach(item => visit(item))

    return sorted
  }

  // Apply topological sort to ensure dependencies are respected
  workItems = topologicalSort(workItems)

  // Build dependency levels for smarter scheduling
  const dependencyLevels = new Map<string, number>()
  const itemById = new Map<string, WorkItem>()
  workItems.forEach(item => itemById.set(item.id, item))

  const calculateLevel = (itemId: string, visiting = new Set<string>()): number => {
    if (dependencyLevels.has(itemId)) {
      return dependencyLevels.get(itemId)!
    }
    if (visiting.has(itemId)) {
      return 0 // Circular dependency
    }

    const item = itemById.get(itemId)
    if (!item) return 0

    visiting.add(itemId)
    let level = 0

    if (item.dependencies && item.dependencies.length > 0) {
      for (const depId of item.dependencies) {
        level = Math.max(level, calculateLevel(depId, visiting) + 1)
      }
    }

    visiting.delete(itemId)
    dependencyLevels.set(itemId, level)
    return level
  }

  // Calculate levels for all items
  workItems.forEach(item => calculateLevel(item.id))

  // Sort by dependency level first, then by priority within each level
  workItems.sort((a, b) => {
    const aLevel = dependencyLevels.get(a.id) || 0
    const bLevel = dependencyLevels.get(b.id) || 0

    // Different levels - items with no/fewer dependencies come first
    if (aLevel !== bLevel) {
      return aLevel - bLevel
    }

    // Same dependency level - apply priority sorting

    // Locked tasks first
    if (a.isLocked && b.isLocked) {
      const aTime = a.lockedStartTime ? new Date(a.lockedStartTime).getTime() : Infinity
      const bTime = b.lockedStartTime ? new Date(b.lockedStartTime).getTime() : Infinity
      return aTime - bTime
    }
    if (a.isLocked) return -1
    if (b.isLocked) return 1

    // Then deadlines
    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
    const now = startDate.getTime()
    const oneDayMs = 24 * 60 * 60 * 1000

    if (aDeadline - now < oneDayMs || bDeadline - now < oneDayMs) {
      if (aDeadline - now < oneDayMs && bDeadline - now < oneDayMs) {
        return aDeadline - bDeadline
      }
      return aDeadline - now < oneDayMs ? -1 : 1
    }

    // Finally by priority score
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

    // Track initial block state for debugging
    const blockStartState = blockCapacities.map(block => {
      // Calculate effective capacity based on current time
      let effectiveFocusMinutes = block.focusMinutesTotal
      let effectiveAdminMinutes = block.adminMinutesTotal
      let timeConstraint = ''

      if (currentTime > block.startTime && currentTime < block.endTime) {
        // We're in the middle of this block
        const remainingMinutes = Math.floor((block.endTime.getTime() - currentTime.getTime()) / 60000)
        const totalMinutes = Math.floor((block.endTime.getTime() - block.startTime.getTime()) / 60000)
        const ratio = remainingMinutes / totalMinutes

        effectiveFocusMinutes = Math.floor(block.focusMinutesTotal * ratio)
        effectiveAdminMinutes = Math.floor(block.adminMinutesTotal * ratio)
        timeConstraint = ` (started at ${currentTime.toLocaleTimeString()})`
      } else if (currentTime >= block.endTime) {
        // This block is in the past
        effectiveFocusMinutes = 0
        effectiveAdminMinutes = 0
        timeConstraint = ' (in the past)'
      }

      return {
        ...block,
        date: dateStr,
        effectiveFocusMinutes,
        effectiveAdminMinutes,
        timeConstraint,
      }
    })

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

    // Re-sort items based on current workflow progress to ensure good interleaving
    const itemsToSchedule = [...workItems]
    itemsToSchedule.sort((a, b) => {
      // If we have scheduling context, recalculate priorities with current time
      if (schedulingContext) {
        // Update context with current time and last scheduled item
        schedulingContext.currentTime = currentTime
        schedulingContext.lastScheduledItem = scheduledItems.length > 0
          ? scheduledItems[scheduledItems.length - 1] as ScheduledItem
          : undefined

        // Recalculate priorities with deadline pressure
        const aPriority = calculatePriority(a.originalItem as Task, schedulingContext)
        const bPriority = calculatePriority(b.originalItem as Task, schedulingContext)

        // Always respect locked tasks first
        if (a.isLocked && b.isLocked) {
          const aTime = a.lockedStartTime ? new Date(a.lockedStartTime).getTime() : Infinity
          const bTime = b.lockedStartTime ? new Date(b.lockedStartTime).getTime() : Infinity
          return aTime - bTime
        }
        if (a.isLocked) return -1
        if (b.isLocked) return 1

        // Use enhanced priority calculation
        return bPriority - aPriority
      }

      // Fallback to original sorting logic if no context
      // Always respect locked tasks first
      if (a.isLocked && b.isLocked) {
        const aTime = a.lockedStartTime ? new Date(a.lockedStartTime).getTime() : Infinity
        const bTime = b.lockedStartTime ? new Date(b.lockedStartTime).getTime() : Infinity
        return aTime - bTime
      }
      if (a.isLocked) return -1
      if (b.isLocked) return 1

      // Then respect deadlines
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      const now = startDate.getTime()
      const oneDayMs = 24 * 60 * 60 * 1000

      if (aDeadline - now < oneDayMs && bDeadline - now < oneDayMs) {
        return aDeadline - bDeadline
      }
      if (aDeadline - now < oneDayMs) return -1
      if (bDeadline - now < oneDayMs) return 1

      // Penalize workflows that have already made progress
      const aProgress = a.workflowId ? (workflowProgress.get(a.workflowId) || 0) : 0
      const bProgress = b.workflowId ? (workflowProgress.get(b.workflowId) || 0) : 0

      // If one workflow has significantly more progress, deprioritize it
      if (Math.abs(aProgress - bProgress) >= 2) {
        return aProgress - bProgress // Lower progress = higher priority
      }

      // Otherwise use the original priority calculation
      const aIsWorkflowStep = a.type === 'workflow-step'
      const bIsWorkflowStep = b.type === 'workflow-step'

      const aEffectivePriority = aIsWorkflowStep && (a.stepIndex ?? 0) > 0
        ? a.priority * (0.9 - aProgress * 0.1) // Further reduce priority based on workflow progress
        : a.priority

      const bEffectivePriority = bIsWorkflowStep && (b.stepIndex ?? 0) > 0
        ? b.priority * (0.9 - bProgress * 0.1)
        : b.priority

      return bEffectivePriority - aEffectivePriority
    })

    for (let i = 0; i < itemsToSchedule.length; i++) {
      const item = itemsToSchedule[i]
      if (!item) continue
      const originalIndex = workItems.findIndex(w => w.id === item.id)

      // Initialize itemScheduled flag
      let itemScheduled = false

      // First check if any async waits have completed since we last checked
      const newlyFinishedWaits: Date[] = []
      for (const [endTime, itemId] of asyncWaitEndTimes.entries()) {
        if (endTime <= currentTime) {
          completedSteps.add(itemId)
          newlyFinishedWaits.push(endTime)
        }
      }
      newlyFinishedWaits.forEach(time => asyncWaitEndTimes.delete(time))

      // Handle locked tasks - they must be scheduled at their exact time
      if (item.isLocked && item.lockedStartTime) {
        const lockedTime = new Date(item.lockedStartTime)
        const lockedEndTime = new Date(lockedTime.getTime() + item.duration * 60000)

        // Check if the locked time is on the current day
        const lockedDateStr = lockedTime.toISOString().split('T')[0]
        const currentDateStr = currentDate.toISOString().split('T')[0]

        if (lockedDateStr === currentDateStr) {
          // Check for conflicts with already scheduled items
          const hasConflict = scheduledItems.some(scheduled => {
            return !(lockedEndTime <= scheduled.startTime || lockedTime >= scheduled.endTime)
          })

          if (hasConflict) {
            debugInfo.warnings.push(
              `Cannot schedule locked task "${item.name}" at ${lockedTime.toLocaleString()} - conflicts with existing scheduled items`,
            )
          } else {
            // Schedule the locked task at its exact time
            scheduledItems.push({
              id: item.id,
              name: `🔒 ${item.name}`,
              type: item.type,
              priority: item.priority,
              duration: item.duration,
              startTime: lockedTime,
              endTime: lockedEndTime,
              color: item.color,
              workflowId: item.workflowId,
              workflowName: item.workflowName,
              stepIndex: item.stepIndex,
              deadline: item.deadline,
              originalItem: item.originalItem,
            })

            // Update current time if needed
            if (lockedEndTime > currentTime) {
              currentTime = new Date(lockedEndTime)
            }

            // Mark as completed and remove from work items
            completedSteps.add(item.id)
            workItems.splice(originalIndex, 1)
            itemsScheduledToday = true
            itemScheduled = true
          }
        } else if (lockedDateStr < currentDateStr) {
          // Locked time is in the past - warn and skip
          debugInfo.warnings.push(
            `Locked task "${item.name}" has a start time in the past (${lockedTime.toLocaleString()}) - skipping`,
          )
          workItems.splice(originalIndex, 1)
          itemScheduled = true
        }

        // Skip the normal scheduling logic for locked tasks
        if (itemScheduled) continue
      }

      // CRITICAL: Check if this item's dependencies are still waiting on async time
      // If a dependency has async wait time, we cannot schedule this item until
      // the async wait completes
      if (item.dependencies && item.dependencies.length > 0) {
        let canScheduleItem = true

        for (const dep of item.dependencies) {
          // Dependencies can be in format ["name", "id"] or just "id"
          // Extract the actual step ID (it's the last element if array, or the string itself)
          const depId = Array.isArray(dep) ? dep[dep.length - 1] : dep

          // Check if this dependency is still in an async wait period
          let isWaitingOnAsync = false
          for (const [asyncEndTime, waitingItemId] of asyncWaitEndTimes.entries()) {
            if (waitingItemId === depId && asyncEndTime > currentTime) {
              // This dependency is still waiting, cannot schedule yet
              canScheduleItem = false
              isWaitingOnAsync = true
              // This is expected behavior for async dependencies - don't clutter warnings
              if (!debugInfo.asyncDependencies) {
                debugInfo.asyncDependencies = []
              }
              debugInfo.asyncDependencies.push(
                `"${item.name}" waiting for "${depId}" (async until ${asyncEndTime.toLocaleString()})`,
              )
              break
            }
          }

          if (isWaitingOnAsync) {
            break // Already found we can't schedule
          }

          // Also check if the dependency has been completed/scheduled at all
          if (!completedSteps.has(depId)) {
            // Check if it's been scheduled (even if not "completed" in execution terms)
            const depScheduled = scheduledItems.some(si => si.id === depId)
            if (!depScheduled) {
              // Maybe it's a workflow step that hasn't been processed yet
              // Check if it exists in our workItems
              const depExists = workItems.some(w => w.id === depId)
              if (!depExists) {
                // This dependency doesn't exist - log warning but allow scheduling
                // This can happen with complex workflows - log to separate category
                if (!debugInfo.missingDependencies) {
                  debugInfo.missingDependencies = []
                }
                debugInfo.missingDependencies.push(
                  `"${item.name}" has unknown dependency "${depId}"`,
                )
              } else {
                // Dependency exists but not scheduled yet
                canScheduleItem = false
                // This is normal scheduling order - not a warning
                if (!debugInfo.pendingDependencies) {
                  debugInfo.pendingDependencies = []
                }
                debugInfo.pendingDependencies.push(
                  `"${item.name}" waiting for "${depId}"`,
                )
                break
              }
            }
          }
        }

        if (!canScheduleItem) {
          // Skip this item for now, it will be retried later
          continue
        }
      }

      // Try to fit in available blocks
      let attemptedBlocks = 0
      for (const block of blockCapacities) {
        attemptedBlocks++
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
          if (item.category === 'personal') {
            block.personalMinutesUsed += item.duration
          } else if (item.taskType === 'focused') {
            block.focusMinutesUsed += item.duration
          } else {
            block.adminMinutesUsed += item.duration
          }

          // Track workflow progress
          if (item.workflowId) {
            workflowProgress.set(item.workflowId, (workflowProgress.get(item.workflowId) || 0) + 1)
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

          // Remove from work items using the original index
          workItems.splice(originalIndex, 1)
          itemsScheduledToday = true
          itemScheduled = true
          break
        }
      }

      // If we couldn't schedule this item in any block today, track why
      if (!itemScheduled && blockCapacities.length > 0) {
        // Determine why the item couldn't be scheduled
        let reason = 'Unknown reason'

        // Check category compatibility first
        const isPersonalTask = item.category === 'personal'
        const hasCompatibleBlock = blockCapacities.some(block => {
          if (isPersonalTask) {
            return block.blockType === 'personal'
          } else {
            return block.blockType !== 'personal'
          }
        })

        if (!hasCompatibleBlock) {
          reason = isPersonalTask
            ? 'No personal blocks available for personal task'
            : 'No work blocks available for work task'
        } else if (blockCapacities.every(block => {
          // Check both category compatibility and capacity
          const categoryMismatch = (isPersonalTask && block.blockType !== 'personal') ||
                                  (!isPersonalTask && block.blockType === 'personal')
          if (categoryMismatch) return true

          if (item.taskType === 'focused') {
            return block.focusMinutesUsed + item.duration > block.focusMinutesTotal
          } else {
            return block.adminMinutesUsed + item.duration > block.adminMinutesTotal
          }
        })) {
          reason = `No compatible block has enough ${item.taskType} capacity (needs ${item.duration} minutes)`
        } else {
          const lastBlock = blockCapacities[blockCapacities.length - 1]
          if (lastBlock && currentTime.getTime() >= lastBlock.endTime.getTime()) {
            reason = 'Current time is past all blocks for today'
          } else {
            reason = 'Time conflicts with other scheduled items'
          }
        }

        // Check if currentTime is past all blocks for today
        const lastBlock = blockCapacities[blockCapacities.length - 1]
        if (lastBlock && currentTime.getTime() >= lastBlock.endTime.getTime()) {
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
      // Track block utilization before moving to next day
      blockCapacities.forEach((block, index) => {
        const original = blockStartState[index]
        const unusedFocus = block.focusMinutesTotal - block.focusMinutesUsed
        const unusedAdmin = block.adminMinutesTotal - block.adminMinutesUsed

        let unusedReason: string | undefined
        if (unusedFocus > 30 || unusedAdmin > 30) {
          if (unusedFocus > 30 && unusedAdmin > 30) {
            unusedReason = `${unusedFocus} focus and ${unusedAdmin} admin minutes unused`
          } else if (unusedFocus > 30) {
            unusedReason = `${unusedFocus} focus minutes unused`
          } else {
            unusedReason = `${unusedAdmin} admin minutes unused`
          }
        }

        const blockState = blockStartState[index]
        debugInfo.blockUtilization.push({
          date: dateStr,
          blockId: block.blockId,
          startTime: block.startTime.toLocaleTimeString(),
          endTime: block.endTime.toLocaleTimeString(),
          focusUsed: block.focusMinutesUsed,
          focusTotal: block.focusMinutesTotal,
          adminUsed: block.adminMinutesUsed,
          adminTotal: block.adminMinutesTotal,
          unusedReason: unusedReason || blockState?.timeConstraint,
        })
      })

      currentDate.setDate(currentDate.getDate() + 1)
      dayIndex++

      // Find the next day's pattern and set currentTime to the start of the first block
      const nextDateStr = currentDate.toISOString().split('T')[0]
      const nextPattern = patterns.find(p => p.date === nextDateStr)

      if (nextPattern && nextPattern.blocks.length > 0) {
        // Sort blocks by start time and get the earliest
        const earliestBlock = nextPattern.blocks
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
        if (earliestBlock) {
          currentTime = parseTimeOnDate(currentDate, earliestBlock.startTime)
        } else {
          currentTime = new Date(currentDate)
        }

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
          if (earliestBlock) {
            currentTime = parseTimeOnDate(currentDate, earliestBlock.startTime)
          } else {
            currentTime = new Date(currentDate)
          }

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

    // Also track block utilization at the end of the scheduling loop
    if (blockCapacities && blockCapacities.length > 0) {
      blockCapacities.forEach((block, index) => {
        const blockState = blockStartState[index]
        // Only add if not already tracked
        const alreadyTracked = debugInfo.blockUtilization.some(b =>
          b.date === dateStr && b.blockId === block.blockId,
        )
        if (!alreadyTracked) {
          debugInfo.blockUtilization.push({
            date: dateStr,
            blockId: block.blockId,
            startTime: block.startTime.toLocaleTimeString(),
            endTime: block.endTime.toLocaleTimeString(),
            focusUsed: block.focusMinutesUsed,
            focusTotal: block.focusMinutesTotal,
            adminUsed: block.adminMinutesUsed,
            adminTotal: block.adminMinutesTotal,
            unusedReason: blockState?.timeConstraint ?? null,
          })
        }
      })
    }
  }

  // Track any remaining unscheduled items
  workItems.forEach(item => {
    debugInfo.unscheduledItems.push({
      name: item.name,
      type: item.taskType,
      duration: item.duration,
      reason: 'Ran out of available days or capacity',
    })
  })

  // Add warnings if significant capacity was unused
  const totalUnusedFocus = debugInfo.blockUtilization.reduce((sum, block) =>
    sum + (block.focusTotal - block.focusUsed), 0)
  const totalUnusedAdmin = debugInfo.blockUtilization.reduce((sum, block) =>
    sum + (block.adminTotal - block.adminUsed), 0)

  if (totalUnusedFocus > 120 && workItems.some(w => w.taskType === 'focused')) {
    debugInfo.warnings.push(`${totalUnusedFocus} minutes of focus time unused while focus tasks remain unscheduled`)
  }
  if (totalUnusedAdmin > 120 && workItems.some(w => w.taskType === 'admin')) {
    debugInfo.warnings.push(`${totalUnusedAdmin} minutes of admin time unused while admin tasks remain unscheduled`)
  }

  return { scheduledItems, debugInfo }
}
