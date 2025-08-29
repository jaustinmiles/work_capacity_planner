/**
 * Optimal Schedule Generator
 *
 * Creates mathematically optimal schedules that minimize total completion time
 * while respecting only hard constraints (sleep, meetings).
 *
 * Key principles:
 * - No artificial work hour limits
 * - Generate work blocks based on task needs
 * - Optimize for earliest possible completion
 * - Smart handling of async work and dependencies
 */

import { Task, TaskStep } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { WorkMeeting } from '@shared/work-blocks-types'
import {
  WorkItem,
  topologicalSort,
  calculateCriticalPaths,
  createWorkItems,
  checkDependencies,
  createAsyncWaitItem,
  sortBySchedulingPriority,
} from './scheduling-common'

export interface OptimalScheduleConfig {
  sleepStart: string // e.g., '23:00' - when sleep begins
  sleepEnd: string   // e.g., '07:00' - when wake up
  meetings: WorkMeeting[]
  preferredBreakInterval?: number // minutes between breaks (default: 90)
  preferredBreakDuration?: number // break duration in minutes (default: 15)
  maxContinuousWork?: number // max minutes before forced break (default: 180)
}

export interface OptimalWorkBlock {
  id: string
  date: string
  startTime: Date
  endTime: Date
  items: OptimalScheduledItem[]
  type: 'work' | 'break' | 'sleep' | 'meeting'
  reason?: string // Why this block was created
}

export interface OptimalScheduledItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait'
  startTime: Date
  endTime: Date
  duration: number
  priority: number
  deadline?: Date
  dependencies?: string[]
  isAsyncTrigger?: boolean
  asyncWaitTime?: number
  cognitiveComplexity?: number
  originalItem: Task | TaskStep | SequencedTask
}

export interface OptimizationResult {
  blocks: OptimalWorkBlock[]
  schedule: OptimalScheduledItem[]
  metrics: {
    totalDuration: number // Total time from start to finish
    activeWorkTime: number // Time actually working
    asyncParallelTime: number // Time saved through parallelization
    deadlinesMet: number
    deadlinesMissed: number
    avgCompletionTime: number // Average time to complete items
    criticalPathLength: number // Longest dependency chain
  }
  warnings: string[]
  suggestions: string[]
}



/**
 * Check if a time slot conflicts with sleep or meetings
 */
function hasConflict(
  startTime: Date,
  endTime: Date,
  config: OptimalScheduleConfig,
): { hasConflict: boolean; type?: 'sleep' | 'meeting'; until?: Date } {
  // Check sleep hours
  const startHour = startTime.getHours()
  const [sleepStartHour, sleepStartMin] = config.sleepStart.split(':').map(Number)
  const [sleepEndHour, sleepEndMin] = config.sleepEnd.split(':').map(Number)

  // Create sleep period for the day
  const sleepStartToday = new Date(startTime)
  sleepStartToday.setHours(sleepStartHour, sleepStartMin, 0, 0)

  const sleepEndToday = new Date(startTime)
  sleepEndToday.setHours(sleepEndHour, sleepEndMin, 0, 0)

  // If sleep end is before sleep start, it's the next day
  if (sleepEndHour < sleepStartHour) {
    if (startHour >= sleepStartHour || startHour < sleepEndHour) {
      // In sleep period
      if (startHour >= sleepStartHour) {
        // After sleep start, wake up tomorrow
        const wakeTime = new Date(startTime)
        wakeTime.setDate(wakeTime.getDate() + 1)
        wakeTime.setHours(sleepEndHour, sleepEndMin, 0, 0)
        return { hasConflict: true, type: 'sleep', until: wakeTime }
      } else {
        // Before sleep end, wake up today
        return { hasConflict: true, type: 'sleep', until: sleepEndToday }
      }
    }
  } else {
    // Normal sleep period (e.g., 1am to 7am)
    if (startHour >= sleepStartHour && startHour < sleepEndHour) {
      return { hasConflict: true, type: 'sleep', until: sleepEndToday }
    }
  }

  // Check meetings
  for (const meeting of config.meetings) {
    // Handle meetings with either full date-time or just time strings
    let meetingStart: Date
    let meetingEnd: Date

    // If meeting has a date property, use it; otherwise use the date from startTime parameter
    if ('date' in meeting && meeting.date) {
      // Construct full date-time from date and time components
      meetingStart = new Date(`${meeting.date}T${meeting.startTime}:00`)
      meetingEnd = new Date(`${meeting.date}T${meeting.endTime}:00`)
    } else if (meeting.startTime.includes('T')) {
      // Full ISO date-time string
      meetingStart = new Date(meeting.startTime)
      meetingEnd = new Date(meeting.endTime)
    } else {
      // Just time strings - use the date from the slot being checked
      const dateStr = startTime.toISOString().split('T')[0]
      meetingStart = new Date(`${dateStr}T${meeting.startTime}:00`)
      meetingEnd = new Date(`${dateStr}T${meeting.endTime}:00`)
    }

    // Validate dates before using them
    if (isNaN(meetingStart.getTime()) || isNaN(meetingEnd.getTime())) {
      continue // Skip invalid meetings
    }

    if (!(endTime <= meetingStart || startTime >= meetingEnd)) {
      return { hasConflict: true, type: 'meeting', until: meetingEnd }
    }
  }

  return { hasConflict: false }
}

/**
 * Generate optimal schedule
 */
export function generateOptimalSchedule(
  tasks: Task[],
  workflows: SequencedTask[],
  startTime: Date,
  config: OptimalScheduleConfig,
): OptimizationResult {
  const schedule: OptimalScheduledItem[] = []
  const blocks: OptimalWorkBlock[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  // Convert to work items using common utility
  const workItems = createWorkItems(tasks, workflows)

  // Apply topological sort to respect dependencies
  const topoResult = topologicalSort(workItems)
  const topoSorted = topoResult.sorted
  if (topoResult.warnings.length > 0) {
    warnings.push(...topoResult.warnings)
  }

  // Calculate critical paths
  const criticalPaths = calculateCriticalPaths(topoSorted)

  // Apply scheduling priority sort after topological sort
  const sortedWorkItems = sortBySchedulingPriority(topoSorted, criticalPaths)

  // Convert WorkItem to OptimalScheduledItem format
  const sortedItems = sortedWorkItems.map(item => ({
    id: item.id,
    name: item.name,
    type: item.type as 'task' | 'workflow-step' | 'async-wait',
    startTime: new Date(), // Will be set during scheduling
    endTime: new Date(),   // Will be set during scheduling
    duration: item.duration,
    priority: item.priority,
    deadline: item.deadline,
    dependencies: item.dependencies,
    isAsyncTrigger: item.isAsyncTrigger,
    asyncWaitTime: item.asyncWaitTime,
    cognitiveComplexity: item.cognitiveComplexity,
    originalItem: item.originalItem,
    criticalPath: criticalPaths.get(item.id) || item.duration,
  }))

  // Track scheduling state
  let currentTime = new Date(startTime)

  // Check if we're starting during sleep hours and advance to next morning if needed
  const initialConflict = hasConflict(currentTime, new Date(currentTime.getTime() + 60000), config)
  if (initialConflict.hasConflict && initialConflict.type === 'sleep' && initialConflict.until) {
    currentTime = initialConflict.until
  }

  let continuousWorkTime = 0
  const completedItems = new Set<string>()
  const asyncEndTimes = new Map<string, Date>() // Track when async waits complete
  let currentBlock: OptimalWorkBlock | null = null

  // Schedule items
  while (sortedItems.length > 0) {
    let scheduledInThisIteration = false
    let conflictEncountered = false

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i]

      // Check dependencies using common utility
      const depCheck = checkDependencies(
        item as WorkItem,
        completedItems,
        asyncEndTimes,
        currentTime,
      )

      if (!depCheck.canSchedule) {
        // If we're waiting on async dependencies, we might need to advance time
        if (depCheck.earliestStart && depCheck.earliestStart > currentTime &&
            sortedItems.every(otherItem =>
              otherItem === item ||
              (otherItem.dependencies && otherItem.dependencies.some(d => !completedItems.has(d))),
            )) {
          // All remaining items are waiting on dependencies
          // Advance time to when the async completes
          currentTime = depCheck.earliestStart
          continuousWorkTime = 0 // Reset continuous work after wait

          // Mark any async tasks that have completed as done
          for (const [taskId, endTime] of asyncEndTimes.entries()) {
            if (endTime <= currentTime && !completedItems.has(taskId)) {
              completedItems.add(taskId)
            }
          }
        }
        continue // Skip this item for now
      }

      // Check if we need a break
      const breakNeeded = continuousWorkTime >= (config.maxContinuousWork || 180)
      if (breakNeeded) {
        // Schedule a break
        const breakStart = new Date(currentTime)
        const breakDuration = config.preferredBreakDuration || 15
        const breakEnd = new Date(breakStart.getTime() + breakDuration * 60000)

        if (currentBlock) {
          blocks.push(currentBlock)
          currentBlock = null
        }

        blocks.push({
          id: `break-${breakStart.getTime()}`,
          date: breakStart.toISOString().split('T')[0],
          startTime: breakStart,
          endTime: breakEnd,
          items: [],
          type: 'break',
          reason: 'Scheduled break after continuous work',
        })

        currentTime = breakEnd
        continuousWorkTime = 0
      }

      // Calculate when this item would end
      const itemStart = new Date(currentTime)
      let itemEnd = new Date(itemStart.getTime() + item.duration * 60000)

      // Check for conflicts
      const conflict = hasConflict(itemStart, itemEnd, config)
      if (conflict.hasConflict) {
        if (conflict.until) {
          // Skip to after the conflict
          if (currentBlock) {
            blocks.push(currentBlock)
            currentBlock = null
          }

          // Add sleep or meeting block
          blocks.push({
            id: `${conflict.type}-${currentTime.getTime()}`,
            date: currentTime.toISOString().split('T')[0],
            startTime: currentTime,
            endTime: conflict.until,
            items: [],
            type: conflict.type!,
          })

          currentTime = conflict.until
          continuousWorkTime = 0 // Reset after sleep/meeting
          conflictEncountered = true
          break // Break the for loop to restart with new time
        }
      }

      // Schedule the item
      item.startTime = itemStart
      item.endTime = itemEnd
      schedule.push(item)

      // Check if this item would cross midnight and cap it
      const itemStartDate = itemStart.toISOString().split('T')[0]
      const maxEndTime = new Date(itemStart)
      maxEndTime.setHours(23, 0, 0, 0) // Cap at 11:00 PM to avoid midnight issues

      if (itemEnd > maxEndTime) {
        // Would go past 11pm, truncate it
        item.endTime = maxEndTime
        itemEnd = maxEndTime
      }

      // Now handle block creation
      if (!currentBlock || currentBlock.type !== 'work' || currentBlock.date !== itemStartDate) {
          if (currentBlock) {
            blocks.push(currentBlock)
          }
          currentBlock = {
            id: `work-${itemStart.getTime()}`,
            date: itemStartDate,
            startTime: itemStart,
            endTime: itemEnd,
            items: [item],
            type: 'work',
          }
      } else {
        currentBlock.items.push(item)
        currentBlock.endTime = itemEnd
      }

      // Update state
      currentTime = itemEnd
      continuousWorkTime += item.duration

      // Handle async wait times
      if (item.isAsyncTrigger && item.asyncWaitTime) {
        const asyncComplete = new Date(itemEnd.getTime() + item.asyncWaitTime * 60000)
        asyncEndTimes.set(item.id, asyncComplete)
        // Don't mark async tasks as complete yet - they're complete after the wait

        // Add async wait as a scheduled item using common utility
        const asyncWait = createAsyncWaitItem(item as WorkItem, itemEnd, item.asyncWaitTime)
        schedule.push({
          ...asyncWait,
          type: 'async-wait',
          cognitiveComplexity: undefined,
          deadline: undefined,
          dependencies: undefined,
          isAsyncTrigger: undefined,
          asyncWaitTime: undefined,
        } as OptimalScheduledItem)

        suggestions.push(
          `Started async work "${item.name}" at ${itemStart.toLocaleTimeString()}. ` +
          `Can work on other tasks while waiting until ${asyncComplete.toLocaleTimeString()}.`,
        )
      } else {
        // Non-async tasks are complete immediately
        completedItems.add(item.id)
      }

      // Remove from sorted items
      sortedItems.splice(i, 1)
      scheduledInThisIteration = true
      break
    }

    // If we encountered a conflict, retry from the new time
    if (conflictEncountered) {
      continue // Restart the while loop with the new current time
    }

    if (!scheduledInThisIteration) {
      // No items could be scheduled, might need to wait for async
      const nextAsyncComplete = Array.from(asyncEndTimes.entries())
        .filter(([id, time]) => !completedItems.has(id) && time > currentTime)
        .sort((a, b) => a[1].getTime() - b[1].getTime())[0]

      if (nextAsyncComplete) {
        // Wait for next async to complete
        if (currentBlock) {
          blocks.push(currentBlock)
          currentBlock = null
        }

        currentTime = nextAsyncComplete[1]
        warnings.push(`Waiting for async task to complete until ${currentTime.toLocaleTimeString()}`)
      } else {
        // Unschedulable items remain
        sortedItems.forEach(item => {
          warnings.push(`Could not schedule "${item.name}" - check dependencies`)
        })
        break
      }
    }
  }

  // Add final block if exists
  if (currentBlock) {
    blocks.push(currentBlock)
  }

  // Calculate metrics
  const firstStart = schedule.length > 0 ? schedule[0].startTime : startTime
  const lastEnd = schedule.length > 0 ?
    schedule.reduce((latest, item) =>
      item.endTime > latest ? item.endTime : latest, schedule[0].endTime,
    ) : startTime

  const totalDuration = (lastEnd.getTime() - firstStart.getTime()) / 60000
  const activeWorkTime = schedule
    .filter(item => item.type !== 'async-wait')
    .reduce((sum, item) => sum + item.duration, 0)
  const asyncParallelTime = schedule
    .filter(item => item.type === 'async-wait')
    .reduce((sum, item) => sum + item.duration, 0)

  // Check deadlines
  let deadlinesMet = 0
  let deadlinesMissed = 0

  schedule.forEach(item => {
    if (item.deadline) {
      if (item.endTime <= item.deadline) {
        deadlinesMet++
      } else {
        deadlinesMissed++
        warnings.push(
          `"${item.name}" will miss deadline by ${
            Math.round((item.endTime.getTime() - item.deadline.getTime()) / 60000)
          } minutes`,
        )
      }
    }
  })

  return {
    blocks,
    schedule,
    metrics: {
      totalDuration,
      activeWorkTime,
      asyncParallelTime,
      deadlinesMet,
      deadlinesMissed,
      avgCompletionTime: activeWorkTime / schedule.length,
      criticalPathLength: Math.max(...Array.from(criticalPaths.values())),
    },
    warnings,
    suggestions,
  }
}

/**
 * Convert optimal schedule to work patterns for display
 */
export function optimalScheduleToWorkPatterns(result: OptimizationResult) {
  // Group blocks by date
  const patternsByDate = new Map<string, OptimalWorkBlock[]>()

  result.blocks.forEach(block => {
    const dateStr = block.date
    const existing = patternsByDate.get(dateStr) || []
    existing.push(block)
    patternsByDate.set(dateStr, existing)
  })

  // Convert to display format
  return Array.from(patternsByDate.entries()).map(([date, blocks]) => ({
    date,
    blocks: blocks
      .filter(b => b.type === 'work')
      .map(b => {
        // Times should already be capped at 11pm from the generation logic
        // No need to adjust here

        return {
          id: b.id,
          startTime: b.startTime.toTimeString().slice(0, 5),
          endTime: b.endTime.toTimeString().slice(0, 5),
          type: 'flexible' as const,
          items: b.items,
        }
      }),
    meetings: blocks
      .filter(b => b.type === 'meeting')
      .map(b => ({
        id: b.id,
        title: 'Meeting',
        startTime: b.startTime.toTimeString().slice(0, 5),
        endTime: b.endTime.toTimeString().slice(0, 5),
      })),
  }))
}
