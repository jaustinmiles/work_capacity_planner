/**
 * TASK COMPLETION PROCESSOR
 *
 * Centralized, stateless function that determines the correct outcome
 * when a task or step is completed. Every completion path in the app
 * should call this to decide whether to set status to 'completed'
 * or 'waiting' (if the entity has an async wait timer).
 *
 * Pure function — no DB calls, no Zustand, no side effects.
 */

import { Task, TaskStep } from './types'
import { TaskStatus } from './enums'
import { getCurrentTime } from './time-provider'

export interface CompletionRequest {
  entityType: 'task' | 'step'
  entityId: string
  task?: Task
  step?: TaskStep
  completedAt?: Date
}

export interface CompletionResult {
  /** Whether the entity should be 'completed' or 'waiting' */
  finalStatus: TaskStatus.Completed | TaskStatus.Waiting
  /** When the work was finished (timer counts from here) */
  completedAt: Date
  /** Whether an async wait timer should be started */
  shouldStartTimer: boolean
  /** Duration of the timer in minutes (0 if no timer) */
  asyncWaitMinutes: number
}

/**
 * Process a task or step completion and determine the correct final state.
 *
 * If the entity has `asyncWaitTime > 0`, returns 'waiting' status so the
 * polling system can auto-complete it when the timer expires. Otherwise
 * returns 'completed' immediately.
 */
export function processCompletion(request: CompletionRequest): CompletionResult {
  const completedAt = request.completedAt ?? getCurrentTime()
  let asyncWaitMinutes = 0

  if (request.entityType === 'task' && request.task) {
    asyncWaitMinutes = request.task.asyncWaitTime ?? 0
  } else if (request.entityType === 'step' && request.step) {
    asyncWaitMinutes = request.step.asyncWaitTime ?? 0
  }

  const shouldStartTimer = asyncWaitMinutes > 0

  return {
    finalStatus: shouldStartTimer ? TaskStatus.Waiting : TaskStatus.Completed,
    completedAt,
    shouldStartTimer,
    asyncWaitMinutes,
  }
}
