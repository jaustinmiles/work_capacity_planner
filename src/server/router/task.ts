/**
 * Task Router
 *
 * Handles all task-related operations including:
 * - CRUD for tasks
 * - Workflow/sequenced task operations
 * - Task archiving
 * - Task completion
 */

import { z } from 'zod'
import { router, protectedProcedure, sessionProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime, getLocalDateString } from '../../shared/time-provider'
import { UnifiedScheduler, OptimizationMode } from '../../shared/unified-scheduler'
import { DEFAULT_WORK_SETTINGS } from '../../shared/work-settings-types'
import { filterSchedulableItems, filterSchedulableWorkflows } from '../../shared/utils/store-comparison'
import { NextScheduledItemType, UnifiedScheduleItemType, MeetingType } from '../../shared/enums'
import type { Task } from '../../shared/types'
import type { SequencedTask } from '../../shared/sequencing-types'
import type { DailyWorkPattern } from '../../shared/work-blocks-types'

/**
 * Schema for creating a task
 */
const createTaskInput = z.object({
  name: z.string().min(1),
  duration: z.number().int().positive(),
  importance: z.number().int().min(1).max(10),
  urgency: z.number().int().min(1).max(10),
  type: z.string(),
  category: z.string().default('work'),
  asyncWaitTime: z.number().int().default(0),
  dependencies: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  deadline: z.date().nullable().optional(),
  deadlineType: z.enum(['hard', 'soft']).nullable().optional(),
  cognitiveComplexity: z.number().int().min(1).max(5).nullable().optional(),
  hasSteps: z.boolean().default(false),
  steps: z
    .array(
      z.object({
        name: z.string(),
        duration: z.number().int(),
        type: z.string(),
        dependsOn: z.array(z.string()).default([]),
        asyncWaitTime: z.number().int().default(0),
        cognitiveComplexity: z.number().int().min(1).max(5).nullable().optional(),
        isAsyncTrigger: z.boolean().default(false),
        expectedResponseTime: z.number().int().nullable().optional(),
      }),
    )
    .optional(),
})

/**
 * Schema for updating a task
 */
const updateTaskInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  duration: z.number().int().positive().optional(),
  importance: z.number().int().min(1).max(10).optional(),
  urgency: z.number().int().min(1).max(10).optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  asyncWaitTime: z.number().int().optional(),
  dependencies: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
  completedAt: z.date().nullable().optional(),
  actualDuration: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  deadline: z.date().nullable().optional(),
  deadlineType: z.enum(['hard', 'soft']).nullable().optional(),
  cognitiveComplexity: z.number().int().min(1).max(5).nullable().optional(),
  isLocked: z.boolean().optional(),
  lockedStartTime: z.date().nullable().optional(),
  overallStatus: z.string().optional(),
  archived: z.boolean().optional(),
  inActiveSprint: z.boolean().optional(),
})

/**
 * Format a task from database to API format
 */
function formatTask(task: {
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
  TaskStep?: Array<{
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
  }>
}) {
  return {
    ...task,
    dependencies: JSON.parse(task.dependencies || '[]') as string[],
    steps: task.TaskStep?.map((step) => ({
      ...step,
      dependsOn: JSON.parse(step.dependsOn || '[]') as string[],
    })),
  }
}

export const taskRouter = router({
  /**
   * Get all tasks for the current session
   */
  getAll: sessionProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const tasks = await ctx.prisma.task.findMany({
        where: {
          sessionId: ctx.sessionId,
          ...(input.includeArchived ? {} : { archived: false }),
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      })

      return tasks.map(formatTask)
    }),

  /**
   * Get a single task by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findUnique({
        where: { id: input.id },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      if (!task) return null
      return formatTask(task)
    }),

  /**
   * Create a new task
   */
  create: sessionProcedure.input(createTaskInput).mutation(async ({ ctx, input }) => {
    const id = generateUniqueId('task')
    const now = getCurrentTime()

    // Calculate workflow durations if steps provided
    let criticalPathDuration = 0
    let worstCaseDuration = 0

    if (input.steps && input.steps.length > 0) {
      // Simple calculation - sum of all step durations
      const totalStepDuration = input.steps.reduce((sum, step) => sum + step.duration, 0)
      const totalAsyncTime = input.steps.reduce((sum, step) => sum + step.asyncWaitTime, 0)
      criticalPathDuration = totalStepDuration
      worstCaseDuration = totalStepDuration + totalAsyncTime
    }

    const task = await ctx.prisma.task.create({
      data: {
        id,
        name: input.name,
        duration: input.duration,
        importance: input.importance,
        urgency: input.urgency,
        type: input.type,
        category: input.category,
        asyncWaitTime: input.asyncWaitTime,
        dependencies: JSON.stringify(input.dependencies),
        notes: input.notes || null,
        projectId: input.projectId || null,
        deadline: input.deadline || null,
        deadlineType: input.deadlineType || null,
        cognitiveComplexity: input.cognitiveComplexity || null,
        hasSteps: input.hasSteps || (input.steps && input.steps.length > 0),
        criticalPathDuration,
        worstCaseDuration,
        sessionId: ctx.sessionId,
        createdAt: now,
        updatedAt: now,
        TaskStep: input.steps
          ? {
              create: input.steps.map((step, index) => ({
                id: generateUniqueId('step'),
                name: step.name,
                duration: step.duration,
                type: step.type,
                dependsOn: JSON.stringify(step.dependsOn),
                asyncWaitTime: step.asyncWaitTime,
                cognitiveComplexity: step.cognitiveComplexity || null,
                isAsyncTrigger: step.isAsyncTrigger,
                expectedResponseTime: step.expectedResponseTime || null,
                stepIndex: index,
              })),
            }
          : undefined,
      },
      include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
    })

    return formatTask(task)
  }),

  /**
   * Update a task
   */
  update: protectedProcedure.input(updateTaskInput).mutation(async ({ ctx, input }) => {
    const { id, dependencies, ...updates } = input

    const task = await ctx.prisma.task.update({
      where: { id },
      data: {
        ...updates,
        dependencies: dependencies ? JSON.stringify(dependencies) : undefined,
        updatedAt: getCurrentTime(),
      },
      include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
    })

    return formatTask(task)
  }),

  /**
   * Delete a task
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.task.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Archive a task
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          archived: true,
          updatedAt: getCurrentTime(),
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })
      return formatTask(task)
    }),

  /**
   * Unarchive a task
   */
  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          archived: false,
          updatedAt: getCurrentTime(),
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })
      return formatTask(task)
    }),

  /**
   * Complete a task
   */
  complete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        actualDuration: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()
      const task = await ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          completed: true,
          completedAt: now,
          actualDuration: input.actualDuration,
          overallStatus: 'completed',
          updatedAt: now,
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })
      return formatTask(task)
    }),

  /**
   * Promote a simple task to a workflow
   */
  promoteToWorkflow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existingTask = await ctx.prisma.task.findUnique({
        where: { id: input.id },
      })

      if (!existingTask) {
        throw new Error(`Task ${input.id} not found`)
      }

      // Create initial step from the task
      const stepId = generateUniqueId('step')

      const task = await ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          hasSteps: true,
          updatedAt: getCurrentTime(),
          TaskStep: {
            create: {
              id: stepId,
              name: existingTask.name,
              duration: existingTask.duration,
              type: existingTask.type,
              dependsOn: '[]',
              asyncWaitTime: 0,
              stepIndex: 0,
            },
          },
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      return formatTask(task)
    }),

  /**
   * Get the next scheduled task/step for the active session.
   *
   * Runs the UnifiedScheduler server-side to determine what the user
   * should work on next. Used by the iOS companion app where the
   * scheduler can't run client-side.
   */
  getNextScheduled: sessionProcedure
    .input(z.object({ skipIndex: z.number().int().default(0) }))
    .query(async ({ ctx, input }) => {
      // Fetch all tasks for this session
      const rawTasks = await ctx.prisma.task.findMany({
        where: { sessionId: ctx.sessionId, archived: false },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      const allTasks = rawTasks.map(formatTask)

      // Separate simple tasks from workflows (tasks with steps)
      const simpleTasks = filterSchedulableItems(
        allTasks.filter((t) => !t.hasSteps) as Task[],
      )
      const workflows = filterSchedulableWorkflows(
        allTasks.filter((t) => t.hasSteps) as unknown as SequencedTask[],
      )

      // Fetch today's work pattern
      const currentTime = getCurrentTime()
      const todayDate = getLocalDateString(currentTime)

      const pattern = await ctx.prisma.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: ctx.sessionId,
            date: todayDate,
          },
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      if (!pattern) {
        return null
      }

      // Convert pattern to DailyWorkPattern format
      const workPattern: DailyWorkPattern = {
        id: pattern.id,
        date: pattern.date,
        blocks: pattern.WorkBlock.map((block) => ({
          id: block.id,
          startTime: block.startTime,
          endTime: block.endTime,
          typeConfig: JSON.parse(block.typeConfig as string),
          capacity: block.totalCapacity
            ? { totalMinutes: block.totalCapacity }
            : undefined,
        })),
        accumulated: {},
        meetings: pattern.WorkMeeting.map((meeting) => ({
          id: meeting.id,
          name: meeting.name,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          type: meeting.type as MeetingType,
          recurring: (meeting.recurring || 'none') as 'daily' | 'weekly' | 'none',
          daysOfWeek: meeting.daysOfWeek
            ? JSON.parse(meeting.daysOfWeek)
            : undefined,
        })),
      }

      // Run the scheduler
      const scheduler = new UnifiedScheduler()
      const items = [...simpleTasks, ...workflows]

      const context = {
        startDate: todayDate,
        tasks: simpleTasks as Task[],
        workflows: workflows,
        workPatterns: [workPattern],
        workSettings: DEFAULT_WORK_SETTINGS,
        currentTime,
      }

      const config = {
        startDate: currentTime,
        allowTaskSplitting: true,
        respectMeetings: true,
        optimizationMode: OptimizationMode.Realistic,
        debugMode: false,
      }

      const result = scheduler.scheduleForDisplay(items, context, config)

      // Extract the next work item (skip non-work items)
      const workItems = result.scheduled
        .filter((item) => {
          if (!item.startTime) return false
          if (
            item.type === UnifiedScheduleItemType.Meeting ||
            item.type === UnifiedScheduleItemType.Break ||
            item.type === UnifiedScheduleItemType.BlockedTime ||
            item.type === UnifiedScheduleItemType.AsyncWait
          ) {
            return false
          }
          if (item.completed) return false
          if (item.isWaitingOnAsync) return false
          return true
        })
        .sort((a, b) => {
          const aTime = a.startTime?.getTime() ?? 0
          const bTime = b.startTime?.getTime() ?? 0
          return aTime - bTime
        })

      if (workItems.length === 0 || input.skipIndex >= workItems.length) {
        return null
      }

      const targetItem = workItems[input.skipIndex]
      if (!targetItem?.startTime) return null

      const taskId = targetItem.originalTaskId || targetItem.id

      // Workflow step
      if (targetItem.type === UnifiedScheduleItemType.WorkflowStep) {
        const workflow = workflows.find((seq) =>
          seq.steps.some((step) => step.id === taskId),
        )
        const step = workflow?.steps.find((s) => s.id === taskId)

        if (step && workflow) {
          return {
            type: NextScheduledItemType.Step,
            id: step.id,
            workflowId: workflow.id,
            title: step.name,
            estimatedDuration: step.duration,
            scheduledStartTime: targetItem.startTime,
            loggedMinutes: step.actualDuration ?? 0,
            workflowName: workflow.name,
          }
        }
      }

      // Regular task
      const task = simpleTasks.find((t) => t.id === taskId)
      return {
        type: NextScheduledItemType.Task,
        id: taskId,
        title: targetItem.name,
        estimatedDuration: targetItem.duration,
        scheduledStartTime: targetItem.startTime,
        loggedMinutes: task?.actualDuration ?? 0,
      }
    }),
})
