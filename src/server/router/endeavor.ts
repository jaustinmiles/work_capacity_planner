/**
 * Endeavor Router
 *
 * Handles CRUD operations for endeavors - higher-level constructs
 * that group related workflows and tasks for cross-project tracking.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { EndeavorStatus, DeadlineType } from '../../shared/enums'
import {
  calculateEndeavorProgress,
  getCrossEndeavorDependencies,
  getBlockingEndeavors,
} from '../../shared/endeavor-utils'
import type { EndeavorWithTasks } from '../../shared/types'

/**
 * Schema for creating an endeavor
 */
const createEndeavorInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional(),
  importance: z.number().int().min(1).max(10).default(5),
  urgency: z.number().int().min(1).max(10).default(5),
  deadline: z.date().optional(),
  deadlineType: z.nativeEnum(DeadlineType).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

/**
 * Schema for updating an endeavor
 */
const updateEndeavorInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(EndeavorStatus).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  urgency: z.number().int().min(1).max(10).optional(),
  deadline: z.date().optional().nullable(),
  deadlineType: z.nativeEnum(DeadlineType).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
})

/**
 * Schema for adding a task to an endeavor
 */
const addItemInput = z.object({
  endeavorId: z.string(),
  taskId: z.string(),
  sortOrder: z.number().int().optional(),
})

/**
 * Schema for reordering items
 */
const reorderItemsInput = z.object({
  endeavorId: z.string(),
  orderedTaskIds: z.array(z.string()),
})

/**
 * Transform Prisma endeavor to typed Endeavor
 */
function transformEndeavor(prismaEndeavor: any): any {
  return {
    ...prismaEndeavor,
    status: prismaEndeavor.status as EndeavorStatus,
    deadlineType: prismaEndeavor.deadlineType as DeadlineType | undefined,
  }
}

export const endeavorRouter = router({
  // ============================================================================
  // Endeavor CRUD
  // ============================================================================

  /**
   * Get all endeavors for the current session
   */
  getAll: sessionProcedure
    .input(
      z.object({
        status: z.nativeEnum(EndeavorStatus).optional(),
        includeArchived: z.boolean().default(false),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: any = { sessionId: ctx.sessionId }

      if (input?.status) {
        where.status = input.status
      } else if (!input?.includeArchived) {
        where.status = { not: EndeavorStatus.Archived }
      }

      const endeavors = await ctx.prisma.endeavor.findMany({
        where,
        include: {
          EndeavorItem: {
            include: {
              Task: {
                include: { TaskStep: true },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ importance: 'desc' }, { urgency: 'desc' }, { createdAt: 'asc' }],
      })

      return endeavors.map((e) => ({
        ...transformEndeavor(e),
        items: e.EndeavorItem.map((item) => ({
          ...item,
          task: {
            ...item.Task,
            dependencies: JSON.parse(item.Task.dependencies) as string[],
            steps: item.Task.TaskStep.map((step) => ({
              ...step,
              dependsOn: JSON.parse(step.dependsOn) as string[],
            })),
          },
        })),
      }))
    }),

  /**
   * Get a single endeavor by ID with full task details
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const endeavor = await ctx.prisma.endeavor.findUnique({
        where: { id: input.id },
        include: {
          EndeavorItem: {
            include: {
              Task: {
                include: { TaskStep: true },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })

      if (!endeavor) return null

      return {
        ...transformEndeavor(endeavor),
        items: endeavor.EndeavorItem.map((item) => ({
          ...item,
          task: {
            ...item.Task,
            dependencies: JSON.parse(item.Task.dependencies) as string[],
            steps: item.Task.TaskStep.map((step) => ({
              ...step,
              dependsOn: JSON.parse(step.dependsOn) as string[],
            })),
          },
        })),
      }
    }),

  /**
   * Create a new endeavor
   */
  create: sessionProcedure.input(createEndeavorInput).mutation(async ({ ctx, input }) => {
    const now = getCurrentTime()

    const endeavor = await ctx.prisma.endeavor.create({
      data: {
        id: generateUniqueId('endeavor'),
        sessionId: ctx.sessionId,
        name: input.name,
        description: input.description || null,
        notes: input.notes || null,
        status: EndeavorStatus.Active,
        importance: input.importance,
        urgency: input.urgency,
        deadline: input.deadline || null,
        deadlineType: input.deadlineType || null,
        color: input.color || null,
        createdAt: now,
        updatedAt: now,
      },
    })

    return transformEndeavor(endeavor)
  }),

  /**
   * Update an endeavor
   */
  update: protectedProcedure.input(updateEndeavorInput).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input

    // Remove undefined values and convert null for optional fields
    const data: any = { updatedAt: getCurrentTime() }
    if (updates.name !== undefined) data.name = updates.name
    if (updates.description !== undefined) data.description = updates.description
    if (updates.notes !== undefined) data.notes = updates.notes
    if (updates.status !== undefined) data.status = updates.status
    if (updates.importance !== undefined) data.importance = updates.importance
    if (updates.urgency !== undefined) data.urgency = updates.urgency
    if (updates.deadline !== undefined) data.deadline = updates.deadline
    if (updates.deadlineType !== undefined) data.deadlineType = updates.deadlineType
    if (updates.color !== undefined) data.color = updates.color

    const endeavor = await ctx.prisma.endeavor.update({
      where: { id },
      data,
    })

    return transformEndeavor(endeavor)
  }),

  /**
   * Delete an endeavor (and all its item associations)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // EndeavorItems cascade delete automatically due to schema
      await ctx.prisma.endeavor.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  // ============================================================================
  // Endeavor Items (Task Association)
  // ============================================================================

  /**
   * Add a task to an endeavor
   */
  addItem: protectedProcedure.input(addItemInput).mutation(async ({ ctx, input }) => {
    // Check if already exists
    const existing = await ctx.prisma.endeavorItem.findUnique({
      where: {
        endeavorId_taskId: {
          endeavorId: input.endeavorId,
          taskId: input.taskId,
        },
      },
    })

    if (existing) {
      return existing
    }

    // Get max sort order for auto-ordering
    let sortOrder = input.sortOrder
    if (sortOrder === undefined) {
      const maxItem = await ctx.prisma.endeavorItem.findFirst({
        where: { endeavorId: input.endeavorId },
        orderBy: { sortOrder: 'desc' },
      })
      sortOrder = (maxItem?.sortOrder ?? -1) + 1
    }

    return ctx.prisma.endeavorItem.create({
      data: {
        id: generateUniqueId('enditem'),
        endeavorId: input.endeavorId,
        taskId: input.taskId,
        sortOrder,
        addedAt: getCurrentTime(),
      },
    })
  }),

  /**
   * Remove a task from an endeavor
   */
  removeItem: protectedProcedure
    .input(
      z.object({
        endeavorId: z.string(),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.endeavorItem.delete({
        where: {
          endeavorId_taskId: {
            endeavorId: input.endeavorId,
            taskId: input.taskId,
          },
        },
      })
      return { success: true }
    }),

  /**
   * Reorder tasks within an endeavor
   */
  reorderItems: protectedProcedure.input(reorderItemsInput).mutation(async ({ ctx, input }) => {
    await ctx.prisma.$transaction(
      input.orderedTaskIds.map((taskId, index) =>
        ctx.prisma.endeavorItem.updateMany({
          where: {
            endeavorId: input.endeavorId,
            taskId,
          },
          data: { sortOrder: index },
        }),
      ),
    )
    return { success: true }
  }),

  // ============================================================================
  // Progress & Analysis
  // ============================================================================

  /**
   * Get progress metrics for an endeavor
   */
  getProgress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const endeavor = await ctx.prisma.endeavor.findUnique({
        where: { id: input.id },
        include: {
          EndeavorItem: {
            include: {
              Task: {
                include: { TaskStep: true },
              },
            },
          },
        },
      })

      if (!endeavor) return null

      const endeavorWithTasks: EndeavorWithTasks = {
        ...transformEndeavor(endeavor),
        items: endeavor.EndeavorItem.map((item) => ({
          ...item,
          task: {
            ...item.Task,
            dependencies: JSON.parse(item.Task.dependencies) as string[],
            steps: item.Task.TaskStep.map((step) => ({
              ...step,
              dependsOn: JSON.parse(step.dependsOn) as string[],
            })),
          },
        })),
      }

      return calculateEndeavorProgress(endeavorWithTasks)
    }),

  /**
   * Get cross-endeavor dependency information
   * Shows which tasks depend on tasks from other endeavors
   */
  getCrossEndeavorDependencies: sessionProcedure
    .input(z.object({ endeavorId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all endeavors with tasks
      const allEndeavors = await ctx.prisma.endeavor.findMany({
        where: { sessionId: ctx.sessionId },
        include: {
          EndeavorItem: {
            include: {
              Task: {
                include: { TaskStep: true },
              },
            },
          },
        },
      })

      const endeavorsWithTasks: EndeavorWithTasks[] = allEndeavors.map((e) => ({
        ...transformEndeavor(e),
        items: e.EndeavorItem.map((item) => ({
          ...item,
          task: {
            ...item.Task,
            dependencies: JSON.parse(item.Task.dependencies) as string[],
            steps: item.Task.TaskStep.map((step) => ({
              ...step,
              dependsOn: JSON.parse(step.dependsOn) as string[],
            })),
          },
        })),
      }))

      const currentEndeavor = endeavorsWithTasks.find((e) => e.id === input.endeavorId)
      if (!currentEndeavor) return { dependencies: [], blockingEndeavors: [] }

      // Get cross-dependencies for each task
      const crossDeps: Array<{
        taskId: string
        taskName: string
        dependencies: ReturnType<typeof getCrossEndeavorDependencies>
      }> = []

      for (const item of currentEndeavor.items) {
        const deps = getCrossEndeavorDependencies(item.task, currentEndeavor, endeavorsWithTasks)
        if (deps.length > 0) {
          crossDeps.push({
            taskId: item.taskId,
            taskName: item.task.name,
            dependencies: deps,
          })
        }
      }

      const blockingEndeavors = getBlockingEndeavors(currentEndeavor, endeavorsWithTasks)

      return {
        dependencies: crossDeps,
        blockingEndeavors,
      }
    }),

  // ============================================================================
  // Step-Level Dependencies (Cross-Workflow)
  // ============================================================================

  /**
   * Add a cross-workflow step dependency
   * Either blockedTaskId OR blockedStepId must be set (not both)
   */
  addDependency: protectedProcedure
    .input(
      z.object({
        endeavorId: z.string(),
        blockedTaskId: z.string().optional(),
        blockedStepId: z.string().optional(),
        blockingStepId: z.string(),
        isHardBlock: z.boolean().default(true),
        notes: z.string().optional(),
      }).refine(
        (data) => (data.blockedTaskId !== undefined) !== (data.blockedStepId !== undefined),
        { message: 'Either blockedTaskId OR blockedStepId must be set, not both or neither' },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the blocking step to find its parent task
      const blockingStep = await ctx.prisma.taskStep.findUnique({
        where: { id: input.blockingStepId },
        select: { taskId: true },
      })

      if (!blockingStep) {
        throw new Error(`Blocking step ${input.blockingStepId} not found`)
      }

      // Validate the blocked entity exists
      if (input.blockedTaskId) {
        const task = await ctx.prisma.task.findUnique({ where: { id: input.blockedTaskId } })
        if (!task) {
          throw new Error(`Blocked task ${input.blockedTaskId} not found`)
        }
      } else if (input.blockedStepId) {
        const step = await ctx.prisma.taskStep.findUnique({ where: { id: input.blockedStepId } })
        if (!step) {
          throw new Error(`Blocked step ${input.blockedStepId} not found`)
        }
        // Prevent self-reference
        if (input.blockedStepId === input.blockingStepId) {
          throw new Error('A step cannot block itself')
        }
      }

      const dependency = await ctx.prisma.endeavorDependency.create({
        data: {
          id: generateUniqueId('enddep'),
          endeavorId: input.endeavorId,
          blockedTaskId: input.blockedTaskId || null,
          blockedStepId: input.blockedStepId || null,
          blockingStepId: input.blockingStepId,
          blockingTaskId: blockingStep.taskId,
          isHardBlock: input.isHardBlock,
          notes: input.notes || null,
          createdAt: getCurrentTime(),
        },
      })

      return dependency
    }),

  /**
   * Remove a dependency by ID
   */
  removeDependency: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.endeavorDependency.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Get all dependencies defined by an endeavor with resolved names
   */
  getDependencies: protectedProcedure
    .input(z.object({ endeavorId: z.string() }))
    .query(async ({ ctx, input }) => {
      const dependencies = await ctx.prisma.endeavorDependency.findMany({
        where: { endeavorId: input.endeavorId },
        orderBy: { createdAt: 'asc' },
      })

      // Resolve names for each dependency
      const resolved = await Promise.all(
        dependencies.map(async (dep) => {
          // Get blocking step and task info
          const blockingStep = await ctx.prisma.taskStep.findUnique({
            where: { id: dep.blockingStepId },
            select: { name: true, status: true },
          })
          const blockingTask = await ctx.prisma.task.findUnique({
            where: { id: dep.blockingTaskId },
            select: { name: true },
          })

          // Get blocked entity name
          let blockedTaskName: string | undefined
          let blockedStepName: string | undefined

          if (dep.blockedTaskId) {
            const task = await ctx.prisma.task.findUnique({
              where: { id: dep.blockedTaskId },
              select: { name: true },
            })
            blockedTaskName = task?.name
          } else if (dep.blockedStepId) {
            const step = await ctx.prisma.taskStep.findUnique({
              where: { id: dep.blockedStepId },
              select: { name: true },
            })
            blockedStepName = step?.name
          }

          // Find which endeavor the blocking task belongs to
          const blockingEndeavorItem = await ctx.prisma.endeavorItem.findFirst({
            where: { taskId: dep.blockingTaskId },
            include: { Endeavor: { select: { id: true, name: true } } },
          })

          return {
            ...dep,
            blockedTaskName,
            blockedStepName,
            blockingStepName: blockingStep?.name || 'Unknown',
            blockingTaskName: blockingTask?.name || 'Unknown',
            blockingStepStatus: blockingStep?.status || 'pending',
            blockingEndeavorId: blockingEndeavorItem?.Endeavor.id,
            blockingEndeavorName: blockingEndeavorItem?.Endeavor.name,
          }
        }),
      )

      return resolved
    }),

  /**
   * Get what's blocking a specific task or step
   * Returns all dependencies where this task/step is the blocked entity
   */
  getBlockersFor: sessionProcedure
    .input(
      z.object({
        taskId: z.string().optional(),
        stepId: z.string().optional(),
      }).refine(
        (data) => data.taskId !== undefined || data.stepId !== undefined,
        { message: 'Either taskId or stepId must be provided' },
      ),
    )
    .query(async ({ ctx, input }) => {
      // Get all endeavors in this session to search their dependencies
      const endeavors = await ctx.prisma.endeavor.findMany({
        where: { sessionId: ctx.sessionId },
        select: { id: true },
      })
      const endeavorIds = endeavors.map((e) => e.id)

      // Find dependencies that block this task or step
      const dependencies = await ctx.prisma.endeavorDependency.findMany({
        where: {
          endeavorId: { in: endeavorIds },
          ...(input.taskId ? { blockedTaskId: input.taskId } : {}),
          ...(input.stepId ? { blockedStepId: input.stepId } : {}),
        },
      })

      // Resolve names (similar to getDependencies)
      const resolved = await Promise.all(
        dependencies.map(async (dep) => {
          const blockingStep = await ctx.prisma.taskStep.findUnique({
            where: { id: dep.blockingStepId },
            select: { name: true, status: true },
          })
          const blockingTask = await ctx.prisma.task.findUnique({
            where: { id: dep.blockingTaskId },
            select: { name: true },
          })
          const endeavor = await ctx.prisma.endeavor.findUnique({
            where: { id: dep.endeavorId },
            select: { name: true },
          })
          const blockingEndeavorItem = await ctx.prisma.endeavorItem.findFirst({
            where: { taskId: dep.blockingTaskId },
            include: { Endeavor: { select: { id: true, name: true } } },
          })

          return {
            ...dep,
            endeavorName: endeavor?.name,
            blockingStepName: blockingStep?.name || 'Unknown',
            blockingTaskName: blockingTask?.name || 'Unknown',
            blockingStepStatus: blockingStep?.status || 'pending',
            blockingEndeavorId: blockingEndeavorItem?.Endeavor.id,
            blockingEndeavorName: blockingEndeavorItem?.Endeavor.name,
          }
        }),
      )

      return resolved
    }),

  /**
   * Update a dependency (e.g., change hard/soft block or notes)
   */
  updateDependency: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        isHardBlock: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const data: Record<string, unknown> = {}
      if (updates.isHardBlock !== undefined) data.isHardBlock = updates.isHardBlock
      if (updates.notes !== undefined) data.notes = updates.notes

      const dependency = await ctx.prisma.endeavorDependency.update({
        where: { id },
        data,
      })
      return dependency
    }),
})
