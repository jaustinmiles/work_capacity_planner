/**
 * Deep Work Board Data Formatters
 *
 * Pure functions that map Prisma database objects to shared application types.
 * Extracted from the server router for testability.
 */

import { StepStatus } from './enums'
import type { TaskStatus } from './enums'
import type { Task, TaskStep } from './types'

// =============================================================================
// Prisma Input Types (matching Prisma query results)
// =============================================================================

/** Shape of a Prisma Task query result (with optional included steps) */
export interface PrismaTaskResult {
  id: string
  name: string
  duration: number
  importance: number
  urgency: number
  type: string
  category: string
  asyncWaitTime: number
  dependencies: string
  completed: boolean
  completedAt: Date | null
  actualDuration: number | null
  notes: string | null
  projectId: string | null
  createdAt: Date
  updatedAt: Date
  sessionId: string | null
  deadline: Date | null
  deadlineType: string | null
  cognitiveComplexity: number | null
  isLocked: boolean
  lockedStartTime: Date | null
  hasSteps: boolean
  currentStepId: string | null
  overallStatus: string
  criticalPathDuration: number
  worstCaseDuration: number
  archived: boolean
  inActiveSprint: boolean
  TaskStep?: PrismaStepResult[]
}

/** Shape of a Prisma TaskStep query result */
export interface PrismaStepResult {
  id: string
  name: string
  duration: number
  type: string
  dependsOn: string
  asyncWaitTime: number
  status: string
  stepIndex: number
  taskId: string
  percentComplete: number
  actualDuration: number | null
  startedAt: Date | null
  completedAt: Date | null
  notes: string | null
  cognitiveComplexity: number | null
  isAsyncTrigger: boolean
  expectedResponseTime: number | null
  importance: number | null
  urgency: number | null
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format a Prisma task result into the shared Task type.
 * Handles JSON parsing of dependencies, null→undefined coercion, and type casting.
 */
export function formatTaskFromPrisma(task: PrismaTaskResult): Task & { steps?: TaskStep[] } {
  return {
    ...task,
    sessionId: task.sessionId ?? '',
    overallStatus: task.overallStatus as TaskStatus,
    deadlineType: task.deadlineType as Task['deadlineType'],
    cognitiveComplexity: task.cognitiveComplexity as Task['cognitiveComplexity'],
    deadline: task.deadline ?? undefined,
    completedAt: task.completedAt ?? undefined,
    actualDuration: task.actualDuration ?? undefined,
    notes: task.notes ?? undefined,
    projectId: task.projectId ?? undefined,
    lockedStartTime: task.lockedStartTime ?? undefined,
    currentStepId: task.currentStepId ?? undefined,
    dependencies: JSON.parse(task.dependencies || '[]') as string[],
    steps: task.TaskStep?.map((step) => formatStepFromPrisma(step)),
  }
}

/**
 * Format a Prisma step result into the shared TaskStep type.
 * Handles JSON parsing of dependsOn, null→undefined coercion, and type casting.
 */
export function formatStepFromPrisma(step: PrismaStepResult): TaskStep {
  return {
    ...step,
    status: step.status as StepStatus,
    dependsOn: JSON.parse(step.dependsOn || '[]') as string[],
    startedAt: step.startedAt ?? undefined,
    completedAt: step.completedAt ?? undefined,
    actualDuration: step.actualDuration ?? undefined,
    notes: step.notes ?? undefined,
    cognitiveComplexity: step.cognitiveComplexity as TaskStep['cognitiveComplexity'],
    importance: step.importance ?? undefined,
    urgency: step.urgency ?? undefined,
    expectedResponseTime: step.expectedResponseTime ?? undefined,
  }
}
