/**
 * Chat Context Provider
 * Aggregates all app state for AI - uses existing types directly (single source of truth)
 */

import { useTaskStore } from '../store/useTaskStore'
import { useSchedulerStore } from '../store/useSchedulerStore'
import { useWorkPatternStore } from '../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../store/useUserTaskTypeStore'
import { useEndeavorStore } from '../store/useEndeavorStore'
import { Task, EndeavorWithTasks } from '@shared/types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { WorkSettings } from '@shared/work-settings-types'
import { UnifiedScheduleItem } from '@shared/unified-scheduler'
import { getCurrentTime, getLocalDateString } from '@shared/time-provider'
import { TaskStatus } from '@shared/enums'
import { addDays } from '@shared/time-utils'
import { getDatabase } from './database'
import type { UserTaskType } from '@shared/user-task-types'
import { TimeGap, detectTimeGaps } from '../utils/gap-detector'

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

export interface DateRange {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
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
  endeavors: EndeavorWithTasks[]
  sprintTaskIds: string[]
  jobContext?: JobContextData
  summary: ContextSummary
  // Gap-filling context (populated when user requests time gap analysis)
  timeGaps?: TimeGap[]
  historicalSessions?: WorkSessionData[]
  historicalPatterns?: DailyWorkPattern[]
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
 * @param jobContext - Optional job context for role-specific prompting
 * @param dateRange - Optional date range for multi-day gap analysis
 */
export async function gatherAppContext(
  jobContext?: JobContextData,
  dateRange?: DateRange,
): Promise<AppContext> {
  const taskStore = useTaskStore.getState()
  const schedulerStore = useSchedulerStore.getState()
  const workPatternStore = useWorkPatternStore.getState()
  const userTaskTypeStore = useUserTaskTypeStore.getState()
  const endeavorStore = useEndeavorStore.getState()

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
        plannedMinutes: ws.plannedMinutes ?? 0,
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
    endeavors: endeavorStore.endeavors,
    sprintTaskIds: allTasks.filter(t => t.inActiveSprint).map(t => t.id),
    summary,
  }

  if (jobContext) {
    context.jobContext = jobContext
  }

  // Fetch multi-day data and detect gaps when a date range is requested
  if (dateRange) {
    const { historicalSessions, historicalPatterns } = await fetchDateRangeData(db, dateRange, currentDateStr)
    context.historicalSessions = historicalSessions
    context.historicalPatterns = historicalPatterns

    // Combine today's sessions with historical for gap detection
    const allSessions = [...context.workSessions, ...historicalSessions]
    const allPatterns = [...historicalPatterns]
    // Include today's pattern if it's in the range
    const todayPattern = workPatternStore.workPatterns.find(p => p.date === currentDateStr)
    if (todayPattern && currentDateStr >= dateRange.startDate && currentDateStr <= dateRange.endDate) {
      // Only add if not already fetched as historical
      if (!allPatterns.some(p => p.date === currentDateStr)) {
        allPatterns.push(todayPattern)
      }
    }

    context.timeGaps = detectTimeGaps(allSessions, allPatterns)
  }

  return context
}

/**
 * Fetch work sessions and patterns for each day in a date range.
 * Excludes the current date (already fetched above).
 */
async function fetchDateRangeData(
  db: ReturnType<typeof getDatabase>,
  dateRange: DateRange,
  currentDateStr: string,
): Promise<{ historicalSessions: WorkSessionData[]; historicalPatterns: DailyWorkPattern[] }> {
  const historicalSessions: WorkSessionData[] = []
  const historicalPatterns: DailyWorkPattern[] = []

  // Iterate through each date in the range
  const startDate = new Date(dateRange.startDate + 'T00:00:00')
  const endDate = new Date(dateRange.endDate + 'T00:00:00')

  let current = startDate
  while (current <= endDate) {
    const dateStr = getLocalDateString(current)

    // Skip today — already fetched in main context
    if (dateStr !== currentDateStr) {
      const [sessions, pattern] = await Promise.all([
        db.getWorkSessions(dateStr),
        db.getWorkPattern(dateStr),
      ])

      for (const ws of sessions) {
        const sessionData: WorkSessionData = {
          id: ws.id,
          taskId: ws.taskId,
          stepId: ws.stepId,
          startTime: new Date(ws.startTime),
          plannedMinutes: ws.plannedMinutes ?? 0,
          actualMinutes: ws.actualMinutes,
          notes: ws.notes,
        }
        if (ws.endTime) {
          sessionData.endTime = new Date(ws.endTime)
        }
        historicalSessions.push(sessionData)
      }

      if (pattern) {
        historicalPatterns.push(pattern)
      }
    }

    current = addDays(current, 1)
  }

  return { historicalSessions, historicalPatterns }
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
  formatted += `- **Work Sessions:** ${context.summary.totalWorkSessions} recent sessions\n`
  formatted += `- **Sprint:** ${context.sprintTaskIds.length} tasks in active sprint\n`
  formatted += `- **Endeavors:** ${context.endeavors.length} endeavors\n\n`

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

  // Sprint
  const sprintSet = new Set(context.sprintTaskIds)
  if (context.sprintTaskIds.length > 0) {
    const sprintTasks = context.tasks.filter(t => sprintSet.has(t.id))
    formatted += `## Sprint (${sprintTasks.length} items)\n\n`
    sprintTasks.forEach(t => {
      formatted += `- **${t.name}** (ID: ${t.id})${t.hasSteps ? ' [Workflow]' : ''}\n`
    })
    formatted += '\n'
  }

  // Endeavors
  if (context.endeavors.length > 0) {
    formatted += `## Endeavors (${context.endeavors.length})\n\n`
    context.endeavors.forEach(endeavor => {
      formatted += `- **${endeavor.name}** (ID: ${endeavor.id}, status: ${endeavor.status}`
      if (endeavor.color) formatted += `, color: ${endeavor.color}`
      formatted += ')\n'
      if (endeavor.items.length > 0) {
        formatted += `  - Tasks: ${endeavor.items.map(item => item.task.name).join(', ')}\n`
      } else {
        formatted += '  - No tasks assigned\n'
      }
    })
    formatted += '\n'
  }

  // Tasks
  const simpleTasks = context.tasks.filter(t => !t.hasSteps)
  const workflows = context.tasks.filter(t => t.hasSteps)

  formatted += `## Tasks (${simpleTasks.length})\n\n`
  simpleTasks.forEach(task => {
    formatted += `- **${task.name}** (ID: ${task.id})${sprintSet.has(task.id) ? ' [SPRINT]' : ''}\n`
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
    formatted += `- **${workflow.name}** (ID: ${workflow.id})${sprintSet.has(workflow.id) ? ' [SPRINT]' : ''}\n`
    formatted += `  - Status: ${workflow.overallStatus}, Total Duration: ${workflow.duration}min, Critical Path: ${workflow.criticalPathDuration}min\n`
    formatted += `  - Importance: ${workflow.importance}, Urgency: ${workflow.urgency}, Type: ${workflow.type}\n`
    if (workflow.steps) {
      // Build step ID to name map for resolving dependencies
      const stepIdToName = new Map<string, string>()
      workflow.steps.forEach(s => stepIdToName.set(s.id, s.name))

      formatted += `  - Steps (${workflow.steps.length}):\n`
      workflow.steps.forEach(step => {
        formatted += `    - ${step.name} (${step.duration}min, ${step.type}, ${step.status})\n`
        if (step.dependsOn && step.dependsOn.length > 0) {
          // Convert step IDs to names for AI context
          const depNames = step.dependsOn.map(id => stepIdToName.get(id) || id)
          formatted += `      - Depends on: ${depNames.join(', ')}\n`
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
  formatted += '\n'

  // Work Sessions - show actual session details, not just count
  if (context.workSessions && context.workSessions.length > 0) {
    formatted += `## Recent Work Sessions (${context.workSessions.length})\n\n`
    formatted += 'These are actual work sessions the user has logged:\n\n'

    // Create lookup maps for task and step names
    const taskNameMap = new Map<string, string>()
    const stepNameMap = new Map<string, { name: string; workflowName: string }>()

    context.tasks.forEach(task => {
      taskNameMap.set(task.id, task.name)
      if (task.steps) {
        task.steps.forEach(step => {
          stepNameMap.set(step.id, { name: step.name, workflowName: task.name })
        })
      }
    })

    // Format each work session (limit to 10 most recent)
    const recentSessions = context.workSessions.slice(0, 10)
    recentSessions.forEach(session => {
      // Determine what this session was for
      let sessionName: string
      if (session.stepId) {
        const stepInfo = stepNameMap.get(session.stepId)
        sessionName = stepInfo
          ? `${stepInfo.name} (workflow: ${stepInfo.workflowName})`
          : `Step ${session.stepId}`
      } else {
        sessionName = taskNameMap.get(session.taskId) || `Task ${session.taskId}`
      }

      // Calculate duration
      let durationStr: string
      if (session.endTime) {
        const durationMs = session.endTime.getTime() - session.startTime.getTime()
        const durationMinutes = Math.round(durationMs / 60000)
        durationStr = `${durationMinutes} min`
      } else {
        durationStr = 'ongoing'
      }

      // Format the session entry
      const isActive = !session.endTime
      const startTimeStr = session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      formatted += `- **${sessionName}**: ${durationStr}`
      if (isActive) {
        formatted += ' ⏱️ ACTIVE'
      }
      formatted += ` (started ${startTimeStr})`
      if (session.notes) {
        formatted += `\n  - Notes: ${session.notes.substring(0, 100)}${session.notes.length > 100 ? '...' : ''}`
      }
      formatted += '\n'
    })

    if (context.workSessions.length > 10) {
      formatted += `\n_...and ${context.workSessions.length - 10} more sessions_\n`
    }
    formatted += '\n'
  }

  // Time gaps — shown when user requested gap analysis
  if (context.timeGaps && context.timeGaps.length > 0) {
    formatted += `## Detected Time Gaps (${context.timeGaps.length})\n\n`
    formatted += 'These are periods within work blocks where no time was logged:\n\n'

    // Group gaps by date
    const gapsByDate = new Map<string, typeof context.timeGaps>()
    for (const gap of context.timeGaps) {
      const existing = gapsByDate.get(gap.date) || []
      existing.push(gap)
      gapsByDate.set(gap.date, existing)
    }

    for (const [date, gaps] of gapsByDate) {
      formatted += `### ${date}\n`
      for (const gap of gaps) {
        const startStr = gap.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const endStr = gap.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        formatted += `- **${startStr} – ${endStr}** (${gap.durationMinutes} min)`
        if (gap.blockName) {
          formatted += ` [within block: ${gap.blockName}]`
        }
        formatted += '\n'
      }
      formatted += '\n'
    }
  }

  // Historical sessions — shown when multi-day context is loaded
  if (context.historicalSessions && context.historicalSessions.length > 0) {
    formatted += `## Historical Work Sessions (${context.historicalSessions.length})\n\n`

    // Create lookup maps
    const taskNameMap = new Map<string, string>()
    const stepNameMap = new Map<string, { name: string; workflowName: string }>()
    context.tasks.forEach(task => {
      taskNameMap.set(task.id, task.name)
      if (task.steps) {
        task.steps.forEach(step => {
          stepNameMap.set(step.id, { name: step.name, workflowName: task.name })
        })
      }
    })

    // Group by date
    const sessionsByDate = new Map<string, WorkSessionData[]>()
    for (const session of context.historicalSessions) {
      const d = session.startTime
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const existing = sessionsByDate.get(dateKey) || []
      existing.push(session)
      sessionsByDate.set(dateKey, existing)
    }

    for (const [date, sessions] of sessionsByDate) {
      formatted += `### ${date}\n`
      for (const session of sessions) {
        let sessionName: string
        if (session.stepId) {
          const stepInfo = stepNameMap.get(session.stepId)
          sessionName = stepInfo ? `${stepInfo.name} (${stepInfo.workflowName})` : `Step ${session.stepId}`
        } else {
          sessionName = taskNameMap.get(session.taskId) || `Task ${session.taskId}`
        }
        const startStr = session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const endStr = session.endTime
          ? session.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'ongoing'
        const durationMin = session.endTime
          ? Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000)
          : null
        formatted += `- **${sessionName}**: ${startStr} – ${endStr}`
        if (durationMin !== null) formatted += ` (${durationMin} min)`
        formatted += '\n'
      }
      formatted += '\n'
    }
  }

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
