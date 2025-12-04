/**
 * Chat Context Provider
 * Aggregates all app state for AI - uses existing types directly (single source of truth)
 */

import { useTaskStore } from '../store/useTaskStore'
import { useSchedulerStore } from '../store/useSchedulerStore'
import { useWorkPatternStore } from '../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../store/useUserTaskTypeStore'
import { Task } from '@shared/types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { WorkSettings } from '@shared/work-settings-types'
import { UnifiedScheduleItem } from '@shared/unified-scheduler'
import { getCurrentTime, getLocalDateString } from '@shared/time-provider'
import { TaskStatus } from '@shared/enums'
import { getDatabase } from './database'
import type { UserTaskType } from '@shared/user-task-types'

export interface JobContextData {
  name: string
  description: string
  context: string
  asyncPatterns: string
  reviewCycles: string
  tools: string
}

export interface WorkSessionData {
  id: string
  taskId: string
  stepId?: string
  startTime: Date
  endTime?: Date
  plannedMinutes: number
  actualMinutes?: number
  notes?: string
}

export interface AppContext {
  currentDate: string
  currentTime: string
  tasks: Task[]  // Use actual Task type
  workPatterns: DailyWorkPattern[]  // Use actual DailyWorkPattern type
  schedule: UnifiedScheduleItem[]  // Use actual UnifiedScheduleItem type
  workSessions: WorkSessionData[]
  workSettings: WorkSettings
  userTaskTypes: UserTaskType[]  // User-defined task types (e.g., "coding", "design", "admin")
  jobContext?: JobContextData
  summary: ContextSummary
}

interface ContextSummary {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  archivedTasks: number
  totalWorkflows: number
  completedWorkflows: number
  inProgressWorkflows: number
  archivedWorkflows: number
  totalWorkPatterns: number
  totalScheduledItems: number
  totalWorkSessions: number
}

/**
 * Gather complete app context for AI
 */
export async function gatherAppContext(jobContext?: JobContextData): Promise<AppContext> {
  const taskStore = useTaskStore.getState()
  const schedulerStore = useSchedulerStore.getState()
  const workPatternStore = useWorkPatternStore.getState()
  const userTaskTypeStore = useUserTaskTypeStore.getState()

  const currentTime = getCurrentTime()
  const currentDateStr = getLocalDateString(currentTime)

  // Get all tasks (including archived)
  const allTasks = taskStore.tasks

  // Get work sessions from database
  const db = getDatabase()
  const workSessions = await db.getWorkSessions(currentDateStr)

  // Separate simple tasks from workflows
  const simpleTasks = allTasks.filter(t => !t.hasSteps)
  const workflows = allTasks.filter(t => t.hasSteps)

  // Calculate summary
  const summary: ContextSummary = {
    totalTasks: simpleTasks.length,
    completedTasks: simpleTasks.filter(t => t.completed).length,
    inProgressTasks: simpleTasks.filter(t => t.overallStatus === TaskStatus.InProgress).length,
    archivedTasks: simpleTasks.filter(t => t.archived).length,
    totalWorkflows: workflows.length,
    completedWorkflows: workflows.filter(w => w.completed).length,
    inProgressWorkflows: workflows.filter(w => w.overallStatus === TaskStatus.InProgress).length,
    archivedWorkflows: workflows.filter(w => w.archived).length,
    totalWorkPatterns: workPatternStore.workPatterns.length,
    totalScheduledItems: schedulerStore.scheduledItems.length,
    totalWorkSessions: workSessions.length,
  }

  const context: AppContext = {
    currentDate: currentDateStr,
    currentTime: currentTime.toISOString(),
    tasks: allTasks,  // All tasks, both simple and workflows
    workPatterns: workPatternStore.workPatterns,
    schedule: schedulerStore.scheduledItems,
    workSessions: workSessions.map(ws => {
      const sessionData: WorkSessionData = {
        id: ws.id,
        taskId: ws.taskId,
        stepId: ws.stepId,
        startTime: new Date(ws.startTime),
        plannedMinutes: ws.plannedMinutes,
        actualMinutes: ws.actualMinutes,
        notes: ws.notes,
      }
      if (ws.endTime) {
        sessionData.endTime = new Date(ws.endTime)
      }
      return sessionData
    }),
    workSettings: taskStore.workSettings,
    userTaskTypes: userTaskTypeStore.types,
    summary,
  }

  if (jobContext) {
    context.jobContext = jobContext
  }

  return context
}

/**
 * Format context as readable text for AI
 */
export function formatContextForAI(context: AppContext): string {
  let formatted = '# Current App Context\n\n'
  formatted += `**Date:** ${context.currentDate}\n`
  formatted += `**Time:** ${new Date(context.currentTime).toLocaleString()}\n\n`

  // Summary
  formatted += '## Summary\n\n'
  formatted += `- **Tasks:** ${context.summary.totalTasks} total (${context.summary.completedTasks} completed, ${context.summary.inProgressTasks} in progress, ${context.summary.archivedTasks} archived)\n`
  formatted += `- **Workflows:** ${context.summary.totalWorkflows} total (${context.summary.completedWorkflows} completed, ${context.summary.inProgressWorkflows} in progress, ${context.summary.archivedWorkflows} archived)\n`
  formatted += `- **Work Patterns:** ${context.summary.totalWorkPatterns} patterns defined\n`
  formatted += `- **Scheduled Items:** ${context.summary.totalScheduledItems} items scheduled\n`
  formatted += `- **Work Sessions:** ${context.summary.totalWorkSessions} recent sessions\n\n`

  // Job Context
  if (context.jobContext) {
    formatted += '## Job Context\n\n'
    formatted += `**Name:** ${context.jobContext.name}\n`
    formatted += `**Description:** ${context.jobContext.description}\n`
    formatted += `**Context:** ${context.jobContext.context}\n`
    formatted += `**Async Patterns:** ${context.jobContext.asyncPatterns}\n`
    formatted += `**Review Cycles:** ${context.jobContext.reviewCycles}\n`
    formatted += `**Tools:** ${context.jobContext.tools}\n\n`
  }

  // User-Defined Task Types
  formatted += `## Available Task Types (${context.userTaskTypes.length})\n\n`
  formatted += 'Use these type IDs when creating or modifying tasks:\n\n'
  context.userTaskTypes.forEach(taskType => {
    formatted += `- **${taskType.name}** (ID: \`${taskType.id}\`)`
    if (taskType.emoji) {
      formatted += ` ${taskType.emoji}`
    }
    formatted += '\n'
  })
  formatted += '\n'

  // Tasks
  const simpleTasks = context.tasks.filter(t => !t.hasSteps)
  const workflows = context.tasks.filter(t => t.hasSteps)

  formatted += `## Tasks (${simpleTasks.length})\n\n`
  simpleTasks.forEach(task => {
    formatted += `- **${task.name}** (ID: ${task.id})\n`
    formatted += `  - Status: ${task.overallStatus}, Duration: ${task.duration}min, Importance: ${task.importance}, Urgency: ${task.urgency}\n`
    formatted += `  - Type: ${task.type}, Completed: ${task.completed}, Archived: ${task.archived}\n`
    if (task.dependencies && task.dependencies.length > 0) {
      formatted += `  - Dependencies: ${task.dependencies.join(', ')}\n`
    }
    if (task.deadline) {
      formatted += `  - Deadline: ${task.deadline.toLocaleDateString()} (${task.deadlineType})\n`
    }
    if (task.notes) {
      formatted += `  - Notes: ${task.notes.substring(0, 100)}${task.notes.length > 100 ? '...' : ''}\n`
    }
  })
  formatted += '\n'

  // Workflows
  formatted += `## Workflows (${workflows.length})\n\n`
  workflows.forEach(workflow => {
    formatted += `- **${workflow.name}** (ID: ${workflow.id})\n`
    formatted += `  - Status: ${workflow.overallStatus}, Total Duration: ${workflow.duration}min, Critical Path: ${workflow.criticalPathDuration}min\n`
    formatted += `  - Importance: ${workflow.importance}, Urgency: ${workflow.urgency}, Type: ${workflow.type}\n`
    if (workflow.steps) {
      formatted += `  - Steps (${workflow.steps.length}):\n`
      workflow.steps.forEach(step => {
        formatted += `    - ${step.name} (${step.duration}min, ${step.type}, ${step.status})\n`
        if (step.dependsOn && step.dependsOn.length > 0) {
          formatted += `      - Depends on: ${step.dependsOn.join(', ')}\n`
        }
      })
    }
  })
  formatted += '\n'

  // Work Patterns
  formatted += `## Work Patterns (${context.workPatterns.length})\n\n`
  context.workPatterns.forEach(pattern => {
    formatted += `- **${pattern.date}**\n`
    formatted += `  - Blocks: ${pattern.blocks.map(b => `${b.startTime}-${b.endTime} (${JSON.stringify(b.typeConfig)})`).join(', ')}\n`
    if (pattern.meetings.length > 0) {
      formatted += `  - Meetings: ${pattern.meetings.map(m => `${m.name} (${m.startTime}-${m.endTime})`).join(', ')}\n`
    }
  })

  return formatted
}

/**
 * Estimate token count (rough approximation)
 * Used to ensure we stay within limits
 */
export function estimateTokenCount(context: AppContext): number {
  const formatted = formatContextForAI(context)
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(formatted.length / 4)
}
