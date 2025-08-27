import { Task, ProductivityPattern, SchedulingPreferences } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import { WorkBlock, WorkMeeting, DailyWorkPattern } from '@shared/work-blocks-types'
import { WorkSettings } from '@shared/work-settings-types'
import { calculatePriority, calculatePriorityWithBreakdown, SchedulingContext } from './deadline-scheduler'
import { logger } from './logger'


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
  // Task splitting support
  isSplit?: boolean
  splitPart?: number // e.g., 1 for "Part 1 of 3"
  splitTotal?: number // e.g., 3 for "Part 1 of 3"
  originalTaskId?: string // Links split parts together
  remainingDuration?: number // Duration left to schedule
}

export interface SchedulingDebugInfo {
  unscheduledItems: Array<{
    id?: string
    name: string
    type: string
    duration: number
    reason: string
    priorityBreakdown?: {
      eisenhower: number  // importance * urgency
      deadlineBoost: number
      asyncBoost: number
      cognitiveMatch: number
      contextSwitchPenalty: number
      workflowDepthBonus?: number
      total: number
    }
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
    personalUsed?: number
    personalTotal?: number
    unusedReason?: string
  }>
  warnings: string[]
  asyncDependencies?: string[]
  missingDependencies?: string[]
  pendingDependencies?: string[]
  scheduledItemsPriority?: Array<{
    id: string
    name: string
    scheduledTime: string
    priorityBreakdown: {
      eisenhower: number
      deadlineBoost: number
      asyncBoost: number
      cognitiveMatch: number
      contextSwitchPenalty: number
      workflowDepthBonus?: number
      total: number
    }
  }>
}

interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step'
  taskType: TaskType
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
  originalDuration?: number // Track original duration for split tasks
  splitInfo?: {
    part: number
    total: number
    originalId: string
    splitDate?: string // Track when the split was created
  }
}

interface BlockCapacity {
  blockId: string
  startTime: Date
  endTime: Date
  blockType: TaskType | 'mixed' | 'personal' | 'flexible'
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

function getBlockCapacity(block: WorkBlock, date: Date, currentTime?: Date): BlockCapacity {
  let startTime = parseTimeOnDate(date, block.startTime)
  const endTime = parseTimeOnDate(date, block.endTime)

  // Adjust start time if it's in the past (only for real-time scheduling, not tests)
  if (currentTime) {
    if (startTime < currentTime && endTime > currentTime) {
      // Block has already started, adjust start time to current time
      startTime = new Date(currentTime)
    }
  }

  const durationMinutes = Math.floor(Math.max(0, (endTime.getTime() - startTime.getTime()) / 60000))

  let focusMinutes = 0
  let adminMinutes = 0
  let personalMinutes = 0

  if (block.capacity) {
    focusMinutes = block.capacity.focusMinutes || 0
    adminMinutes = block.capacity.adminMinutes || 0
    personalMinutes = block.capacity.personalMinutes || 0
  } else if (block.type === TaskType.Focused) {
    focusMinutes = durationMinutes
  } else if (block.type === TaskType.Admin) {
    adminMinutes = durationMinutes
  } else if (block.type === 'personal') {
    personalMinutes = durationMinutes
  } else if (block.type === 'flexible') {
    // Flexible block - store the total duration that can be used for either focus OR admin
    // Not both - this is the total available time that can be allocated to either type
    focusMinutes = durationMinutes
    adminMinutes = durationMinutes
    // Note: We'll handle this specially in canFitInBlock to track combined usage
  } else { // mixed
    focusMinutes = durationMinutes / 2
    adminMinutes = durationMinutes / 2
  }

  return {
    blockId: block.id,
    startTime,
    endTime,
    blockType: block.type as 'mixed' | 'personal' | 'flexible' | TaskType,
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

  meetings.forEach((meeting, __index) => {
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

interface FitResult {
  canFit: boolean
  startTime: Date
  availableMinutes?: number // How many minutes can fit if partial
  canPartiallyFit?: boolean // True if some portion can fit
}

function canFitInBlock(
  item: WorkItem,
  block: BlockCapacity,
  currentTime: Date,
  scheduledItems: ScheduledItem[],
  now?: Date,
  allowSplitting?: boolean,
): FitResult {
  // Don't count async wait times as conflicts when checking for available slots
  const nonWaitScheduledItems = scheduledItems.filter(s => !s.isWaitTime)

  // Check type compatibility
  const isPersonalTask = item.taskType === TaskType.Personal
  const isPersonalBlock = block.blockType === 'personal'

  // Personal tasks can only go in personal blocks
  if (isPersonalTask && !isPersonalBlock) {
    return { canFit: false, startTime: currentTime }
  }

  // Non-personal tasks cannot go in personal blocks
  if (!isPersonalTask && isPersonalBlock) {
    return { canFit: false, startTime: currentTime }
  }

  // Check if this is a flexible block (accepts any non-personal work)
  const isFlexibleBlock = block.blockType === 'flexible'

  // Check capacity based on task type and calculate available minutes
  let availableCapacity = 0
  if (isFlexibleBlock && item.taskType !== TaskType.Personal) {
    // Flexible block - use combined capacity for focus/admin work
    const totalUsed = block.focusMinutesUsed + block.adminMinutesUsed
    const totalCapacity = Math.min(block.focusMinutesTotal, block.adminMinutesTotal) // Use the smaller to be safe
    availableCapacity = totalCapacity - totalUsed

    if (totalUsed + item.duration > totalCapacity) {
      if (allowSplitting && availableCapacity > 0) {
        return {
          canFit: false,
          startTime: currentTime,
          canPartiallyFit: true,
          availableMinutes: availableCapacity,
        }
      }
      return { canFit: false, startTime: currentTime }
    }
  } else if (item.taskType === TaskType.Personal) {
    availableCapacity = block.personalMinutesTotal - block.personalMinutesUsed
    if (block.personalMinutesUsed + item.duration > block.personalMinutesTotal) {
      if (allowSplitting && availableCapacity > 0) {
        // Can partially fit
        return {
          canFit: false,
          startTime: currentTime,
          canPartiallyFit: true,
          availableMinutes: availableCapacity,
        }
      }
      return { canFit: false, startTime: currentTime }
    }
  } else if (item.taskType === TaskType.Focused) {
    availableCapacity = block.focusMinutesTotal - block.focusMinutesUsed
    if (block.focusMinutesUsed + item.duration > block.focusMinutesTotal) {
      if (allowSplitting && availableCapacity > 0) {
        // Can partially fit
        return {
          canFit: false,
          startTime: currentTime,
          canPartiallyFit: true,
          availableMinutes: availableCapacity,
        }
      }
      return { canFit: false, startTime: currentTime }
    }
  } else {
    availableCapacity = block.adminMinutesTotal - block.adminMinutesUsed
    if (block.adminMinutesUsed + item.duration > block.adminMinutesTotal) {
      if (allowSplitting && availableCapacity > 0) {
        // Can partially fit
        return {
          canFit: false,
          startTime: currentTime,
          canPartiallyFit: true,
          availableMinutes: availableCapacity,
        }
      }
      return { canFit: false, startTime: currentTime }
    }
  }

  // Find next available time in block
  // For backfilling: try from block start, but respect current time for today's blocks
  // Only backfill within the same day, not into the past
  const actualNow = now || currentTime
  const blockDate = new Date(block.startTime)
  const isToday = blockDate.toDateString() === actualNow.toDateString()

  let tryTime: Date
  if (isToday && actualNow > block.startTime) {
    // For today's blocks that have already started, start from actual current time
    tryTime = new Date(Math.max(actualNow.getTime(), block.startTime.getTime()))
  } else if (isToday && actualNow <= block.startTime) {
    // Today's block that hasn't started yet - can start from block beginning
    tryTime = new Date(block.startTime.getTime())
  } else {
    // Future blocks - can backfill from start
    tryTime = new Date(block.startTime.getTime())
  }

  const itemEndTime = new Date(tryTime.getTime() + item.duration * 60000)

  // Check if it fits before block ends
  if (itemEndTime > block.endTime) {
    // Calculate how many minutes could fit before block ends
    if (allowSplitting) {
      const minutesUntilBlockEnd = Math.floor((block.endTime.getTime() - tryTime.getTime()) / 60000)
      if (minutesUntilBlockEnd > 0 && minutesUntilBlockEnd < availableCapacity) {
        return {
          canFit: false,
          startTime: tryTime,
          canPartiallyFit: true,
          availableMinutes: Math.min(minutesUntilBlockEnd, availableCapacity),
        }
      }
    }
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
  allowTaskSplitting?: boolean // Enable splitting long tasks across blocks
  minimumSplitDuration?: number // Minimum minutes for a split (default 30)
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
  // Consistency check: Remove any workflows from tasks array that are in sequencedTasks
  const workflowIds = new Set(sequencedTasks.map(w => w.id))
  const duplicateWorkflows = tasks.filter(t => workflowIds.has(t.id))

  // Filter out duplicates to prevent double scheduling
  const dedupedTasks = tasks.filter(t => !workflowIds.has(t.id))

  if (duplicateWorkflows.length > 0) {
    logger.scheduler.warn(
      `⚠️ Scheduler Warning: ${duplicateWorkflows.length} workflows found in both tasks and sequencedTasks arrays. ` +
      'Removing from tasks array to prevent duplicate scheduling. ' +
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
    scheduledItemsPriority: [],
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

  // Convert tasks to work items (using deduped tasks)
  const incompleteTasks = dedupedTasks.filter(task => !task.completed)

  incompleteTasks
    .forEach(task => {
      // Calculate priority using enhanced function if context available
      const priority = schedulingContext
        ? calculatePriority(task, schedulingContext)
        : task.importance * task.urgency

      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        taskType: task.type,
        priority,
        duration: task.duration,
        originalDuration: task.duration, // Store original for split tracking
        asyncWaitTime: task.asyncWaitTime,
        dependencies: task.dependencies || [],
        color: task.type === TaskType.Personal ? '#9333EA' : '#6B7280',
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
        .forEach((step, stepIndex) => {
          // Skip adding completed steps to the scheduling queue, but they still exist for dependency resolution
          if (step.status === 'completed') {
            // We'll add completed steps to a separate tracking structure below
            return
          }

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
            taskType: step.type,
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

  // Track completed workflow steps for dependency resolution
  const completedStepIds = new Set<string>()
  sequencedTasks.forEach(workflow => {
    workflow.steps
      .filter(step => step.status === 'completed')
      .forEach(step => completedStepIds.add(step.id))
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
        // Check if dependency exists in work items or is a completed step
        if (!itemById.has(depId) && !completedStepIds.has(depId)) {
          // Missing dependency - mark this item as unschedulable
          level = Number.MAX_SAFE_INTEGER
          break
        }
        // If dependency is completed, don't increment level
        // If dependency is in work items, calculate its level
        if (itemById.has(depId)) {
          level = Math.max(level, calculateLevel(depId, visiting) + 1)
        }
      }
    }

    visiting.delete(itemId)
    dependencyLevels.set(itemId, level)
    return level
  }

  // Calculate levels for all items
  workItems.forEach(item => calculateLevel(item.id))

  // Group items by dependency level while preserving topological order
  const levelGroups = new Map<number, WorkItem[]>()
  const itemsWithMissingDeps: WorkItem[] = []

  workItems.forEach(item => {
    const level = dependencyLevels.get(item.id) || 0

    // Filter out items with missing dependencies
    if (level === Number.MAX_SAFE_INTEGER) {
      itemsWithMissingDeps.push(item)
      debugInfo.unscheduledItems.push({
        ...item,
        reason: 'Missing dependency - one or more dependencies do not exist',
      })
      return
    }

    if (!levelGroups.has(level)) {
      levelGroups.set(level, [])
    }
    levelGroups.get(level)!.push(item)
  })

  // Sort within each level by priority, but maintain level ordering
  const sortedWorkItems: WorkItem[] = []
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b)

  for (const level of sortedLevels) {
    const itemsAtLevel = levelGroups.get(level)!

    // Sort items within this dependency level by priority
    itemsAtLevel.sort((a, b) => {
      // Locked tasks first
      if (a.isLocked && b.isLocked) {
        const aTime = a.lockedStartTime ? new Date(a.lockedStartTime).getTime() : Infinity
        const bTime = b.lockedStartTime ? new Date(b.lockedStartTime).getTime() : Infinity
        return aTime - bTime
      }
      if (a.isLocked) return -1
      if (b.isLocked) return 1

      // Check for extremely urgent deadlines (less than 4 hours)
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      const now = startDate.getTime()
      const fourHoursMs = 4 * 60 * 60 * 1000

      // Only override priority for truly urgent deadlines
      if (aDeadline - now < fourHoursMs || bDeadline - now < fourHoursMs) {
        if (aDeadline - now < fourHoursMs && bDeadline - now < fourHoursMs) {
          // Both are urgent, use priority as tiebreaker
          return b.priority - a.priority
        }
        return aDeadline - now < fourHoursMs ? -1 : 1
      }

      // Use calculated priority which includes async boost
      return b.priority - a.priority
    })

    sortedWorkItems.push(...itemsAtLevel)
  }

  workItems = sortedWorkItems

  // Process each day
  const actualNow = new Date() // The real current time
  const now = startDate // The provided start time for scheduling
  const currentDate = new Date(startDate)
  currentDate.setHours(0, 0, 0, 0)
  let currentTime = new Date(Math.max(startDate.getTime(), actualNow.getTime())) // Don't schedule in the past
  let dayIndex = 0
  const maxDays = 30 // Limit to 30 days

  // Single source of truth for block utilization tracking
  const blockUtilizationMap = new Map<string, any>()

  // Process patterns even if there are no work items (for empty block detection)
  const shouldProcessPatterns = workItems.length > 0 || patterns.length > 0

  while ((workItems.length > 0 || (shouldProcessPatterns && dayIndex === 0)) && dayIndex < maxDays) {
    let dateStr = currentDate.toISOString().split('T')[0]
    const pattern = patterns.find(p => p.date === dateStr)

    if (!pattern || pattern.blocks.length === 0) {
      // No pattern for this day, skip to next day
      currentDate.setDate(currentDate.getDate() + 1)
      dateStr = currentDate.toISOString().split('T')[0]  // Update dateStr for the new day
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
    const blockCapacities = pattern.blocks.map(block => getBlockCapacity(block, currentDate, currentTime))

    // Register blocks in the utilization map (single source of truth)
    blockCapacities.forEach(block => {
      const key = `${dateStr}-${block.blockId}`
      if (!blockUtilizationMap.has(key)) {
        // For flexible blocks, show total capacity only once (not doubled)
        const isFlexible = block.blockType === 'flexible'
        blockUtilizationMap.set(key, {
          date: dateStr,
          blockId: block.blockId,
          startTime: block.startTime.toLocaleTimeString(),
          endTime: block.endTime.toLocaleTimeString(),
          focusUsed: 0,
          focusTotal: isFlexible ? block.focusMinutesTotal : block.focusMinutesTotal,
          adminUsed: 0,
          adminTotal: isFlexible ? 0 : block.adminMinutesTotal, // Don't double-count for flexible
          personalUsed: 0,
          personalTotal: block.personalMinutesTotal,
          unusedReason: null,
          block: block, // Keep reference for updates
        })
      }
    })

    // Track initial block state for debugging
    const _blockStartState = blockCapacities.map(block => {
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
    // BUT preserve dependency ordering!
    const itemsToSchedule = [...workItems]
    itemsToSchedule.sort((a, b) => {
      // CRITICAL: Always respect dependency levels first
      const aLevel = dependencyLevels.get(a.id) || 0
      const bLevel = dependencyLevels.get(b.id) || 0
      if (aLevel !== bLevel) {
        return aLevel - bLevel // Lower levels (fewer dependencies) come first
      }

      // Within the same dependency level, sort by priority
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

    // Keep trying to schedule items until we can't make progress (for dependency resolution)
    let schedulingProgress = true
    let maxRetries = itemsToSchedule.length * 2 // Prevent infinite loops

    while (schedulingProgress && itemsToSchedule.length > 0 && maxRetries > 0) {
      schedulingProgress = false
      maxRetries--

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
              `Locked task "${item.name}" at ${lockedTime.toLocaleTimeString()} conflicts with already scheduled tasks`,
            )
            debugInfo.unscheduledItems.push({
              ...item,
              reason: `Conflicts with existing scheduled items at ${lockedTime.toLocaleTimeString()}`,
            })
            // Remove from work items but don't schedule
            workItems.splice(originalIndex, 1)
            itemsToSchedule.splice(i, 1)
            i--
            continue
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
            // Also remove from itemsToSchedule
            itemsToSchedule.splice(i, 1)
            i-- // Adjust index since we removed an item
            itemsScheduledToday = true
            itemScheduled = true
            schedulingProgress = true // Mark that we made progress
          }
        } else if (lockedDateStr < currentDateStr) {
          // Locked time is in the past - warn and skip
          debugInfo.warnings.push(
            `Locked task "${item.name}" has a start time in the past (${lockedTime.toLocaleString()}) - skipping`,
          )
          workItems.splice(originalIndex, 1)
          // Also remove from itemsToSchedule
          itemsToSchedule.splice(i, 1)
          i-- // Adjust index since we removed an item
          itemScheduled = true
          schedulingProgress = true // Mark that we made progress
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
      for (const block of blockCapacities) {
        const fitResult = canFitInBlock(item, block, currentTime, scheduledItems, now, options.allowTaskSplitting)

        if (fitResult.canFit || (fitResult.canPartiallyFit && options.allowTaskSplitting)) {
          const { startTime } = fitResult
          const minimumSplit = options.minimumSplitDuration || 10

          // Check if this is a small remainder that shouldn't be scheduled on the same day it was split
          // Small remainders should wait for the next day to avoid fragmentation
          if (item.splitInfo && item.duration < minimumSplit && item.splitInfo.splitDate) {
            // This is a small remainder from a previous split
            // Check if we're still on the same day as when the split was created
            const blockDateStr = block.startTime.toDateString()
            const splitDateStr = item.splitInfo.splitDate
            if (blockDateStr === splitDateStr) {
              // Skip blocks on the same day as the split - schedule on next day
              continue
            }
          }

          // Determine actual duration to schedule in this block
          let durationToSchedule = item.duration
          let isPartialSchedule = false


          if (fitResult.canPartiallyFit && !fitResult.canFit) {
            // This is a partial fit - check if the available minutes meet minimum
            const availableMinutes = fitResult.availableMinutes || 0

            // Check both the piece we'd schedule AND the remainder
            // But only enforce minimum for non-remainder items
            if (!item.splitInfo) {
              // This is an original item being split for the first time
              if (availableMinutes < minimumSplit) {
                // The piece we'd schedule is too small - skip this block
                continue
              }

              // Check if remainder would be too small
              const remainderAfterSplit = item.duration - availableMinutes
              if (remainderAfterSplit > 0 && remainderAfterSplit < minimumSplit) {
                // The remainder would be too small
                // This is OK - we'll schedule the remainder on the next day
                // Allow the split to proceed
              }
            } else {
              // This is already a split item (remainder from previous split)
              // Allow scheduling even if it's smaller than minimumSplit
              // since it's already been split
            }

            durationToSchedule = availableMinutes
            isPartialSchedule = true
          }

          const endTime = new Date(startTime.getTime() + durationToSchedule * 60000)

          // Track split information
          const splitInfo = item.splitInfo || { part: 1, total: 1, originalId: item.id }
          if (isPartialSchedule) {
            // Calculate total parts if this is the first split
            if (splitInfo.total === 1) {
              // Get the original full duration
              const originalDuration = item.originalDuration || item.originalItem?.duration || item.duration
              // Calculate how many parts we'll need based on this first split
              splitInfo.total = Math.ceil(originalDuration / durationToSchedule)
            }
          }

          // Schedule the item (full or partial)
          // Add split label if this is a split task (either being split now or was previously split)
          const isSplitTask = isPartialSchedule || (item.splitInfo && splitInfo.total > 1)
          const scheduledName = isSplitTask
            ? `${item.name} (${splitInfo.part}/${splitInfo.total})`
            : item.name

          const scheduledItem = {
            id: isPartialSchedule ? `${item.id}-part${splitInfo.part}` : item.id,
            name: scheduledName,
            type: item.type,
            priority: item.priority,
            duration: durationToSchedule,
            startTime,
            endTime,
            color: item.color,
            workflowId: item.workflowId,
            workflowName: item.workflowName,
            stepIndex: item.stepIndex,
            deadline: item.deadline,
            originalItem: item.originalItem,
            // Add split information
            isSplit: isSplitTask,
            splitPart: splitInfo.part,
            splitTotal: splitInfo.total,
            originalTaskId: splitInfo.originalId,
            remainingDuration: isPartialSchedule ? item.duration - durationToSchedule : 0,
          }
          scheduledItems.push(scheduledItem)

          // Add priority breakdown to debug info if we have scheduling context
          if (schedulingContext && item.originalItem) {
            const priorityBreakdown = calculatePriorityWithBreakdown(
              item.originalItem as Task | TaskStep,
              schedulingContext,
            )
            debugInfo.scheduledItemsPriority?.push({
              id: scheduledItem.id,
              name: scheduledItem.name,
              scheduledTime: startTime.toISOString(),
              priorityBreakdown,
            })
          }

          // Update block capacity (use actual scheduled duration, not full duration)
          if (item.taskType === TaskType.Personal) {
            block.personalMinutesUsed += durationToSchedule
          } else if (block.blockType === 'flexible') {
            // For flexible blocks, track combined usage
            if (item.taskType === TaskType.Focused) {
              block.focusMinutesUsed += durationToSchedule
            } else {
              block.adminMinutesUsed += durationToSchedule
            }
          } else if (item.taskType === TaskType.Focused) {
            block.focusMinutesUsed += durationToSchedule
          } else {
            block.adminMinutesUsed += durationToSchedule
          }

          // Update the utilization map
          const utilizationKey = `${dateStr}-${block.blockId}`
          const utilization = blockUtilizationMap.get(utilizationKey)
          if (utilization) {
            // For flexible blocks, report combined usage vs total capacity
            if (block.blockType === 'flexible') {
              // const totalUsed = block.focusMinutesUsed + block.adminMinutesUsed  // Keeping for future use
              const totalCapacity = block.focusMinutesTotal // Use the single total capacity value
              utilization.focusUsed = block.focusMinutesUsed
              utilization.adminUsed = block.adminMinutesUsed
              utilization.focusTotal = totalCapacity
              utilization.adminTotal = 0 // Don't double-count capacity for flexible blocks
            } else {
              utilization.focusUsed = block.focusMinutesUsed
              utilization.adminUsed = block.adminMinutesUsed
              utilization.personalUsed = block.personalMinutesUsed
            }
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

          // Handle split tasks - create remainder item if needed
          if (isPartialSchedule) {
            const remainingDuration = item.duration - durationToSchedule
            if (remainingDuration > 0) {
              // Get the original task name (without split suffix)
              const originalName = item.name.replace(/ \(\d+\/\d+\)$/, '')

              // Create a new work item for the remaining duration
              const remainderItem: WorkItem = {
                ...item,
                name: originalName, // Use clean name, will be suffixed when scheduled
                duration: remainingDuration,
                originalDuration: item.originalDuration || item.originalItem?.duration || (item.duration + durationToSchedule),
                splitInfo: {
                  part: splitInfo.part + 1,
                  total: splitInfo.total,
                  originalId: splitInfo.originalId,
                  splitDate: currentDate.toDateString(), // Track when this split was created
                },
              }
              // Replace the original item with the remainder in workItems
              workItems.splice(originalIndex, 1, remainderItem)
              // Also remove the current item from itemsToSchedule since it's been partially scheduled
              itemsToSchedule.splice(i, 1)
              i-- // Adjust index since we removed an item
              itemsScheduledToday = true
              itemScheduled = true
              schedulingProgress = true
              break
            }
          } else {
            // Full task was scheduled - remove from work items
            workItems.splice(originalIndex, 1)
            // Also remove from itemsToSchedule
            itemsToSchedule.splice(i, 1)
            i-- // Adjust index since we removed an item
            itemsScheduledToday = true
            itemScheduled = true
            schedulingProgress = true // Mark that we made progress
            break
          }
        }
      }

      // If we couldn't schedule this item in any block today, track why
      if (!itemScheduled && blockCapacities.length > 0) {
        // Determine why the item couldn't be scheduled
        let reason = 'Unknown reason'

        // Check type compatibility first
        const isPersonalTask = item.taskType === TaskType.Personal
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
          // Check both type compatibility and capacity
          const typeMismatch = (isPersonalTask && block.blockType !== 'personal') ||
                                  (!isPersonalTask && block.blockType === 'personal')
          if (typeMismatch) return true

          if (item.taskType === TaskType.Focused) {
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
        logger.scheduler.debug('reason: ' + reason)

        // Check if currentTime is past all blocks for today
        const lastBlock = blockCapacities[blockCapacities.length - 1]
        if (lastBlock && currentTime.getTime() >= lastBlock.endTime.getTime()) {
          shouldMoveToNextDay = true
          break
        }
      }
    }
    } // End of while loop for dependency resolution

    // Check if we should move to the next day
    // Move if: no items scheduled, should move flag is set, or current time is past all blocks
    const lastBlockEnd = blockCapacities.length > 0
      ? blockCapacities[blockCapacities.length - 1].endTime
      : new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)

    if (!itemsScheduledToday || shouldMoveToNextDay || currentTime.getTime() >= lastBlockEnd.getTime()) {
      // Moving to next day
      currentDate.setDate(currentDate.getDate() + 1)
      dayIndex++
      dateStr = currentDate.toISOString().split('T')[0]  // Update dateStr for the new day

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
        dateStr = currentDate.toISOString().split('T')[0]  // Update dateStr for the new day

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

  }

  // Convert the utilization map to array for debug info (single source of truth)
  blockUtilizationMap.forEach(utilization => {
    const isFlexibleBlock = utilization.block?.blockType === 'flexible'

    const unusedFocus = utilization.focusTotal - utilization.focusUsed
    const unusedAdmin = utilization.adminTotal - utilization.adminUsed
    const unusedPersonal = utilization.personalTotal - utilization.personalUsed

    let unusedReason: string | undefined

    // Check for completely empty blocks
    const totalCapacity = isFlexibleBlock
      ? utilization.focusTotal  // For flexible blocks, use single total
      : utilization.focusTotal + utilization.adminTotal + utilization.personalTotal
    const totalUsed = utilization.focusUsed + utilization.adminUsed + utilization.personalUsed

    if (totalUsed === 0 && totalCapacity > 0) {
      unusedReason = `Empty block: ${totalCapacity} minutes available but unused`
    } else if (isFlexibleBlock) {
      // For flexible blocks, report combined unused time
      const totalUnused = totalCapacity - totalUsed
      if (totalUnused > 30) {
        unusedReason = `${totalUnused} minutes unused (flexible block)`
      }
    } else if (unusedFocus > 30 || unusedAdmin > 30 || unusedPersonal > 30) {
      const parts: string[] = []
      if (unusedFocus > 30) parts.push(`${unusedFocus} focus`)
      if (unusedAdmin > 30) parts.push(`${unusedAdmin} admin`)
      if (unusedPersonal > 30) parts.push(`${unusedPersonal} personal`)
      unusedReason = `${parts.join(', ')} minutes unused`
    }

    debugInfo.blockUtilization.push({
      date: utilization.date,
      blockId: utilization.blockId,
      startTime: utilization.startTime,
      endTime: utilization.endTime,
      focusUsed: utilization.focusUsed,
      focusTotal: utilization.focusTotal,
      adminUsed: utilization.adminUsed,
      adminTotal: utilization.adminTotal,
      personalUsed: utilization.personalUsed,
      personalTotal: utilization.personalTotal,
      unusedReason: unusedReason,
    })
  })

  // Track any remaining unscheduled items
  workItems.forEach(item => {
    // Check if this is a personal task with no personal blocks available
    const isPersonalTask = item.taskType === TaskType.Personal
    const hasAnyPersonalBlocks = patterns.some(pattern =>
      pattern.blocks.some(block => block.type === 'personal' && (block.capacity?.personalMinutes || 0) > 0),
    )
    const hasAnyWorkBlocks = patterns.some(pattern =>
      pattern.blocks.some(block => block.type !== 'personal' &&
        ((block.capacity?.focusMinutes || 0) > 0 || (block.capacity?.adminMinutes || 0) > 0)),
    )

    let reason = 'Ran out of available days or capacity'
    if (isPersonalTask && !hasAnyPersonalBlocks) {
      reason = 'No personal blocks available for personal task'
    } else if (!isPersonalTask && !hasAnyWorkBlocks) {
      reason = 'No work blocks available for work task'
    }

    // Calculate priority breakdown for unscheduled items
    let priorityBreakdown
    if (schedulingContext && item.originalItem) {
      priorityBreakdown = calculatePriorityWithBreakdown(
        item.originalItem as Task | TaskStep,
        schedulingContext,
      )
    }

    debugInfo.unscheduledItems.push({
      id: item.id,
      name: item.name,
      type: item.taskType,
      duration: item.duration,
      reason: reason,
      priorityBreakdown,
    })
  })

  // Add warnings if significant capacity was unused
  const totalUnusedFocus = debugInfo.blockUtilization.reduce((sum, block) =>
    sum + (block.focusTotal - block.focusUsed), 0)
  const totalUnusedAdmin = debugInfo.blockUtilization.reduce((sum, block) =>
    sum + (block.adminTotal - block.adminUsed), 0)

  // Count completely empty blocks
  const emptyBlocks = debugInfo.blockUtilization.filter(block =>
    block.focusUsed === 0 && block.adminUsed === 0 && (block.personalUsed || 0) === 0 &&
    (block.focusTotal > 0 || block.adminTotal > 0 || (block.personalTotal || 0) > 0),
  )

  if (emptyBlocks.length > 0) {
    debugInfo.warnings.push(`${emptyBlocks.length} empty time block(s) detected in schedule`)
  }

  if (totalUnusedFocus > 120 && workItems.some(w => w.taskType === TaskType.Focused)) {
    debugInfo.warnings.push(`${totalUnusedFocus} minutes of focus time unused while focus tasks remain unscheduled`)
  }
  if (totalUnusedAdmin > 120 && workItems.some(w => w.taskType === TaskType.Admin)) {
    debugInfo.warnings.push(`${totalUnusedAdmin} minutes of admin time unused while admin tasks remain unscheduled`)
  }

  return { scheduledItems, debugInfo }
}
