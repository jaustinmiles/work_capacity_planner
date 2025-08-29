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
 * Calculate critical path through all tasks and dependencies
 */
function calculateCriticalPath(
  tasks: Task[],
  workflows: SequencedTask[],
): Map<string, number> {
  const criticalPathLength = new Map<string, number>()
  const dependencies = new Map<string, string[]>()

  // Build dependency graph
  tasks.forEach(task => {
    if (task.dependencies && task.dependencies.length > 0) {
      dependencies.set(task.id, task.dependencies)
    }
  })

  workflows.forEach(workflow => {
    if (workflow.steps) {
      workflow.steps.forEach((step, index) => {
        if (index > 0) {
          // Each step depends on previous step
          const prevStepId = workflow.steps![index - 1].id
          const currentDeps = dependencies.get(step.id) || []
          currentDeps.push(prevStepId)
          dependencies.set(step.id, currentDeps)
        }

        // Also handle explicit dependencies
        if (step.dependsOn) {
          const currentDeps = dependencies.get(step.id) || []
          currentDeps.push(...step.dependsOn)
          dependencies.set(step.id, [...new Set(currentDeps)])
        }
      })
    }
  })

  // Calculate critical path length for each item
  const calculatePathLength = (itemId: string, visited: Set<string> = new Set()): number => {
    if (visited.has(itemId)) return 0 // Cycle detection
    visited.add(itemId)

    if (criticalPathLength.has(itemId)) {
      return criticalPathLength.get(itemId)!
    }

    // Find the item
    let duration = 0
    const task = tasks.find(t => t.id === itemId)
    if (task) {
      duration = task.duration
    } else {
      // Check workflow steps
      for (const workflow of workflows) {
        const step = workflow.steps?.find(s => s.id === itemId)
        if (step) {
          duration = step.duration
          break
        }
      }
    }

    // Add max dependency path length
    const deps = dependencies.get(itemId) || []
    let maxDepPath = 0
    for (const depId of deps) {
      maxDepPath = Math.max(maxDepPath, calculatePathLength(depId, new Set(visited)))
    }

    const totalPath = duration + maxDepPath
    criticalPathLength.set(itemId, totalPath)
    return totalPath
  }

  // Calculate for all items
  tasks.forEach(task => calculatePathLength(task.id))
  workflows.forEach(workflow => {
    workflow.steps?.forEach(step => calculatePathLength(step.id))
  })

  return criticalPathLength
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
    const meetingStart = new Date(meeting.startTime)
    const meetingEnd = new Date(meeting.endTime)

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

  // Calculate critical paths
  const criticalPaths = calculateCriticalPath(tasks, workflows)

  // Convert all items to a unified format
  const workItems: OptimalScheduledItem[] = []

  // Add tasks
  tasks.forEach(task => {
    if (!task.completed) {
      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        startTime: new Date(), // Will be set during scheduling
        endTime: new Date(),   // Will be set during scheduling
        duration: task.duration,
        priority: ('priority' in task && typeof task.priority === 'number') ? task.priority : 50,
        deadline: task.deadline,
        dependencies: task.dependencies,
        isAsyncTrigger: task.isAsyncTrigger,
        asyncWaitTime: task.asyncWaitTime,
        cognitiveComplexity: task.cognitiveComplexity,
        originalItem: task,
      })
    }
  })

  // Add workflow steps
  workflows.forEach(workflow => {
    if (!workflow.completed && workflow.steps) {
      workflow.steps.forEach((step, index) => {
        if (!step.percentComplete || step.percentComplete < 100) {
          const dependencies = [...(step.dependsOn || [])]
          if (index > 0) {
            // Add dependency on previous step
            dependencies.push(workflow.steps![index - 1].id)
          }

          workItems.push({
            id: step.id,
            name: `${workflow.name}: ${step.name}`,
            type: 'workflow-step',
            startTime: new Date(),
            endTime: new Date(),
            duration: step.duration,
            priority: 50, // Workflows don't have priority in our types
            deadline: workflow.deadline,
            dependencies: dependencies.length > 0 ? dependencies : undefined,
            isAsyncTrigger: false, // Steps don't have this in our types
            asyncWaitTime: 0, // Steps don't have this in our types
            cognitiveComplexity: step.cognitiveComplexity,
            originalItem: step,
          })
        }
      })
    }
  })

  // Sort by optimal order
  const sortedItems = workItems.map(item => ({
    ...item,
    criticalPath: criticalPaths.get(item.id) || item.duration,
  }))

  // Sort by optimal order
  sortedItems.sort((a, b) => {
    // 1. Urgent deadlines first
    if (a.deadline && b.deadline) {
      const timeDiff = a.deadline.getTime() - b.deadline.getTime()
      if (Math.abs(timeDiff) > 24 * 60 * 60 * 1000) { // More than 1 day difference
        return timeDiff
      }
    } else if (a.deadline && !b.deadline) {
      return -1
    } else if (!a.deadline && b.deadline) {
      return 1
    }

    // 2. Async triggers early (to maximize parallelization)
    const aAsync = (a.asyncWaitTime || 0) > 0
    const bAsync = (b.asyncWaitTime || 0) > 0
    if (aAsync && !bAsync) return -1
    if (!aAsync && bAsync) return 1
    if (aAsync && bAsync) {
      // Longer async wait times go first
      return (b.asyncWaitTime || 0) - (a.asyncWaitTime || 0)
    }

    // 3. Longer critical paths first (to avoid bottlenecks)
    const pathDiff = b.criticalPath - a.criticalPath
    if (Math.abs(pathDiff) > 60) { // More than 1 hour difference
      return pathDiff
    }

    // 4. Higher priority
    return b.priority - a.priority
  })

  // Track scheduling state
  let currentTime = new Date(startTime)
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

      // Check dependencies
      if (item.dependencies) {
        const allDepsComplete = item.dependencies.every(depId =>
          completedItems.has(depId) ||
          // Check if it's an async wait that's complete
          (asyncEndTimes.has(depId) && asyncEndTimes.get(depId)! <= currentTime),
        )

        if (!allDepsComplete) {
          continue // Skip this item for now
        }
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
      const itemEnd = new Date(itemStart.getTime() + item.duration * 60000)

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

      // Check if this item crosses midnight
      const itemStartDate = itemStart.toISOString().split('T')[0]
      const itemEndDate = itemEnd.toISOString().split('T')[0]

      if (itemStartDate !== itemEndDate) {
        // Item crosses midnight - need to split the block
        if (currentBlock) {
          blocks.push(currentBlock)
        }

        // Create block for today (up to midnight)
        const midnight = new Date(itemStart)
        midnight.setHours(23, 59, 59, 999)

        blocks.push({
          id: `work-${itemStart.getTime()}`,
          date: itemStartDate,
          startTime: itemStart,
          endTime: midnight,
          items: [item],
          type: 'work',
        })

        // Start new block for tomorrow
        const nextDayStart = new Date(midnight)
        nextDayStart.setDate(nextDayStart.getDate() + 1)
        nextDayStart.setHours(0, 0, 0, 0)

        currentBlock = {
          id: `work-${nextDayStart.getTime()}`,
          date: itemEndDate,
          startTime: nextDayStart,
          endTime: itemEnd,
          items: [],
          type: 'work',
        }
      } else {
        // Normal case - item doesn't cross midnight
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
      }

      // Update state
      completedItems.add(item.id)
      currentTime = itemEnd
      continuousWorkTime += item.duration

      // Handle async wait times
      if (item.isAsyncTrigger && item.asyncWaitTime) {
        const asyncComplete = new Date(itemEnd.getTime() + item.asyncWaitTime * 60000)
        asyncEndTimes.set(item.id, asyncComplete)

        // Add async wait as a scheduled item
        schedule.push({
          id: `${item.id}-wait`,
          name: `⏳ Waiting: ${item.name}`,
          type: 'async-wait',
          startTime: itemEnd,
          endTime: asyncComplete,
          duration: item.asyncWaitTime,
          priority: item.priority,
          originalItem: item.originalItem,
        })

        suggestions.push(
          `Started async work "${item.name}" at ${itemStart.toLocaleTimeString()}. ` +
          `Can work on other tasks while waiting until ${asyncComplete.toLocaleTimeString()}.`,
        )
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
        // Ensure times are on the same day for display
        const startDate = b.startTime.toISOString().split('T')[0]
        const endDate = b.endTime.toISOString().split('T')[0]

        let endTime = b.endTime
        if (startDate !== endDate) {
          // If block crosses midnight, cap at 23:59
          endTime = new Date(b.startTime)
          endTime.setHours(23, 59, 0, 0)
        }

        return {
          id: b.id,
          startTime: b.startTime.toTimeString().slice(0, 5),
          endTime: endTime.toTimeString().slice(0, 5),
          type: 'mixed' as const,
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
