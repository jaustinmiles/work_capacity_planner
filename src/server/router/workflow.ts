/**
 * Workflow Router
 *
 * Handles TaskStep operations for workflows.
 * Steps are individual units of work within a workflow task.
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'

/**
 * Schema for adding a step to a workflow
 */
const addStepInput = z.object({
  workflowId: z.string(),
  name: z.string().min(1),
  duration: z.number().int().positive(),
  type: z.string(),
  afterStep: z.string().optional(),
  beforeStep: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  asyncWaitTime: z.number().int().default(0),
  cognitiveComplexity: z.number().int().min(1).max(5).optional(),
  isAsyncTrigger: z.boolean().default(false),
  expectedResponseTime: z.number().int().optional(),
})

/**
 * Schema for updating a step
 */
const updateStepInput = z.object({
  taskId: z.string(),
  stepId: z.string(),
  status: z.string().optional(),
  actualDuration: z.number().int().optional(),
  notes: z.string().optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  completedAt: z.date().optional(),
  startedAt: z.date().optional(),
  name: z.string().optional(),
  duration: z.number().int().optional(),
  type: z.string().optional(),
  cognitiveComplexity: z.number().int().min(1).max(5).optional(),
})

export const workflowRouter = router({
  /**
   * Add a step to a workflow
   */
  addStep: protectedProcedure.input(addStepInput).mutation(async ({ ctx, input }) => {
    // Get current steps to determine positioning
    const existingSteps = await ctx.prisma.taskStep.findMany({
      where: { taskId: input.workflowId },
      orderBy: { stepIndex: 'asc' },
    })

    // Determine step index
    let stepIndex: number
    if (input.afterStep) {
      const afterStepObj = existingSteps.find((s) => s.id === input.afterStep)
      stepIndex = afterStepObj ? afterStepObj.stepIndex + 1 : existingSteps.length
    } else if (input.beforeStep) {
      const beforeStepObj = existingSteps.find((s) => s.id === input.beforeStep)
      stepIndex = beforeStepObj ? beforeStepObj.stepIndex : 0
    } else {
      stepIndex = existingSteps.length
    }

    // Shift existing steps if needed
    await ctx.prisma.$transaction(async (tx) => {
      // Shift steps at or after the new index
      for (const step of existingSteps) {
        if (step.stepIndex >= stepIndex) {
          await tx.taskStep.update({
            where: { id: step.id },
            data: { stepIndex: step.stepIndex + 1 },
          })
        }
      }
    })

    // Create the new step
    const newStep = await ctx.prisma.taskStep.create({
      data: {
        id: generateUniqueId('step'),
        taskId: input.workflowId,
        name: input.name,
        duration: input.duration,
        type: input.type,
        dependsOn: JSON.stringify(input.dependencies || []),
        asyncWaitTime: input.asyncWaitTime,
        cognitiveComplexity: input.cognitiveComplexity || null,
        isAsyncTrigger: input.isAsyncTrigger,
        expectedResponseTime: input.expectedResponseTime || null,
        stepIndex,
      },
    })

    // Update workflow duration
    const allSteps = await ctx.prisma.taskStep.findMany({
      where: { taskId: input.workflowId },
    })
    const totalDuration = allSteps.reduce((sum, s) => sum + s.duration, 0)
    const totalAsyncTime = allSteps.reduce((sum, s) => sum + s.asyncWaitTime, 0)

    await ctx.prisma.task.update({
      where: { id: input.workflowId },
      data: {
        duration: totalDuration,
        criticalPathDuration: totalDuration,
        worstCaseDuration: totalDuration + totalAsyncTime,
        updatedAt: getCurrentTime(),
      },
    })

    return {
      ...newStep,
      dependsOn: JSON.parse(newStep.dependsOn),
    }
  }),

  /**
   * Update a task step
   */
  updateStep: protectedProcedure.input(updateStepInput).mutation(async ({ ctx, input }) => {
    const { taskId, stepId, ...updates } = input

    const step = await ctx.prisma.taskStep.update({
      where: { id: stepId },
      data: updates,
    })

    // Update task's overallStatus if step status changed
    if (updates.status) {
      const allSteps = await ctx.prisma.taskStep.findMany({
        where: { taskId },
      })

      const allCompleted = allSteps.every((s) => s.status === 'completed')
      const anyInProgress = allSteps.some((s) => s.status === 'in_progress')

      let overallStatus = 'not_started'
      if (allCompleted) {
        overallStatus = 'completed'
      } else if (anyInProgress || allSteps.some((s) => s.status === 'completed')) {
        overallStatus = 'in_progress'
      }

      await ctx.prisma.task.update({
        where: { id: taskId },
        data: {
          overallStatus,
          updatedAt: getCurrentTime(),
          completed: allCompleted,
          completedAt: allCompleted ? getCurrentTime() : null,
        },
      })
    }

    return {
      ...step,
      dependsOn: JSON.parse(step.dependsOn),
    }
  }),

  /**
   * Delete a step from a workflow
   */
  deleteStep: protectedProcedure
    .input(z.object({ taskId: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const step = await ctx.prisma.taskStep.findUnique({
        where: { id: input.stepId },
      })

      if (!step) {
        throw new Error(`Step ${input.stepId} not found`)
      }

      await ctx.prisma.$transaction(async (tx) => {
        // Delete the step
        await tx.taskStep.delete({
          where: { id: input.stepId },
        })

        // Reindex remaining steps
        const remainingSteps = await tx.taskStep.findMany({
          where: { taskId: input.taskId },
          orderBy: { stepIndex: 'asc' },
        })

        for (let i = 0; i < remainingSteps.length; i++) {
          const step = remainingSteps[i]
          if (step && step.stepIndex !== i) {
            await tx.taskStep.update({
              where: { id: step.id },
              data: { stepIndex: i },
            })
          }
        }

        // Update workflow duration
        const totalDuration = remainingSteps.reduce((sum, s) => sum + s.duration, 0)
        const totalAsyncTime = remainingSteps.reduce((sum, s) => sum + s.asyncWaitTime, 0)

        await tx.task.update({
          where: { id: input.taskId },
          data: {
            duration: totalDuration,
            criticalPathDuration: totalDuration,
            worstCaseDuration: totalDuration + totalAsyncTime,
            hasSteps: remainingSteps.length > 0,
            updatedAt: getCurrentTime(),
          },
        })
      })

      return { success: true }
    }),

  /**
   * Get work sessions for a specific step
   */
  getStepWorkSessions: protectedProcedure
    .input(z.object({ stepId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workSession.findMany({
        where: { stepId: input.stepId },
        orderBy: { startTime: 'asc' },
      })
    }),

  /**
   * Reorder steps in a workflow
   */
  reorderSteps: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        orderedIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.taskStep.update({
            where: { id },
            data: { stepIndex: index },
          }),
        ),
      )

      return { success: true }
    }),
})
