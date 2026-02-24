/**
 * Deep Work Board Router
 *
 * Handles CRUD for deep work boards, node management (create, move, remove),
 * viewport persistence, and sprint import. Edge creation/removal with
 * Task↔Step morphing will be added in Phase 3.
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { TaskStatus, StepStatus } from '../../shared/enums'
import type { DeepWorkBoard, DeepWorkNode, DeepWorkNodeWithData, DeepWorkEdge } from '../../shared/deep-work-board-types'
import type { MorphResult } from '../../shared/deep-work-board-types'
import type { Task, TaskStep } from '../../shared/types'
import { validateEdgeCreation } from '../../shared/deep-work-clustering'
import { buildConnectMorphResult, buildDisconnectMorphResult, classifyEdgeType, recalculateWorkflowMetrics } from '../../shared/deep-work-morph'

// =============================================================================
// Zod Schemas
// =============================================================================

const createBoardInput = z.object({
  name: z.string().min(1).max(100),
})

const updateBoardInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  actionPanelOpen: z.boolean().optional(),
  actionPanelWidth: z.number().int().min(200).max(600).optional(),
})

const createTaskAndNodeInput = z.object({
  boardId: z.string(),
  name: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  duration: z.number().int().min(0).optional(),
  type: z.string().optional(),
  importance: z.number().int().min(1).max(10).optional(),
  urgency: z.number().int().min(1).max(10).optional(),
})

const addExistingNodeInput = z.object({
  boardId: z.string(),
  taskId: z.string().optional(),
  stepId: z.string().optional(),
  positionX: z.number(),
  positionY: z.number(),
})

const updateNodePositionInput = z.object({
  nodeId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
})

const batchUpdateNodePositionsInput = z.object({
  updates: z.array(updateNodePositionInput),
})

const saveViewportInput = z.object({
  boardId: z.string(),
  zoom: z.number().min(0.1).max(10),
  panX: z.number(),
  panY: z.number(),
})

const createEdgeInput = z.object({
  boardId: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
})

const removeEdgeInput = z.object({
  boardId: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
})

const importFromSprintInput = z.object({
  boardId: z.string(),
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a Prisma task result into the shared Task type.
 * Replicates the pattern from task.ts router.
 */
function formatTaskFromPrisma(task: {
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
}): Task & { steps?: TaskStep[] } {
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
    steps: task.TaskStep?.map((step) => ({
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
    })),
  }
}

/**
 * Format a step from Prisma into the shared TaskStep type.
 */
function formatStepFromPrisma(step: {
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
}): TaskStep {
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

/**
 * Hydrate a DeepWorkNode with its referenced Task or TaskStep data.
 */
async function hydrateNode(
  prisma: Parameters<Parameters<typeof protectedProcedure['query']>[0]>['0']['ctx']['prisma'],
  node: {
    id: string
    boardId: string
    taskId: string | null
    stepId: string | null
    positionX: number
    positionY: number
    width: number
    height: number
    createdAt: Date
    updatedAt: Date
  },
): Promise<DeepWorkNodeWithData> {
  let task: Task | null = null
  let step: TaskStep | null = null
  let parentTask: Task | null = null

  if (node.taskId) {
    const prismaTask = await prisma.task.findUnique({
      where: { id: node.taskId },
      include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
    })
    if (prismaTask) {
      task = formatTaskFromPrisma(prismaTask)
    }
  } else if (node.stepId) {
    const prismaStep = await prisma.taskStep.findUnique({
      where: { id: node.stepId },
    })
    if (prismaStep) {
      step = formatStepFromPrisma(prismaStep)

      // Also fetch parent task
      const prismaParent = await prisma.task.findUnique({
        where: { id: prismaStep.taskId },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })
      if (prismaParent) {
        parentTask = formatTaskFromPrisma(prismaParent)
      }
    }
  }

  return {
    id: node.id,
    boardId: node.boardId,
    taskId: node.taskId,
    stepId: node.stepId,
    positionX: node.positionX,
    positionY: node.positionY,
    width: node.width,
    height: node.height,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    task,
    step,
    parentTask,
  }
}

// =============================================================================
// Edge Derivation
// =============================================================================

/**
 * Derive edges from hydrated node data.
 * Edges come from TaskStep.dependsOn — if step A depends on step B,
 * we find the nodes for both and create an edge B → A.
 */
function deriveEdgesFromHydratedNodes(nodes: DeepWorkNodeWithData[]): DeepWorkEdge[] {
  const edges: DeepWorkEdge[] = []

  // Build lookup: stepId → nodeId
  const stepIdToNodeId = new Map<string, string>()
  for (const node of nodes) {
    if (node.stepId) {
      stepIdToNodeId.set(node.stepId, node.id)
    }
  }

  for (const node of nodes) {
    if (node.step && node.step.dependsOn.length > 0) {
      for (const depStepId of node.step.dependsOn) {
        const sourceNodeId = stepIdToNodeId.get(depStepId)
        if (sourceNodeId) {
          const sourceNode = nodes.find((n) => n.id === sourceNodeId)
          if (sourceNode) {
            edges.push({
              id: `edge-${sourceNodeId}-${node.id}`,
              sourceNodeId,
              targetNodeId: node.id,
              edgeType: classifyEdgeType(sourceNode, node),
            })
          }
        }
      }
    }
  }

  return edges
}

// =============================================================================
// Morph Execution
// =============================================================================

/** Prisma client type extracted from procedure context */
type PrismaClient = Parameters<Parameters<typeof protectedProcedure['query']>[0]>['0']['ctx']['prisma']

/**
 * Execute a MorphResult atomically in a Prisma $transaction.
 *
 * This is the bridge between the declarative morph plan (shared logic)
 * and the imperative Prisma database operations (server-only).
 */
async function executeMorphResult(
  prisma: PrismaClient,
  morphResult: MorphResult,
): Promise<void> {
  const now = getCurrentTime()

  await prisma.$transaction(async (tx) => {
    // 1. Create new workflow task (CreateWorkflow strategy)
    if (morphResult.newWorkflowTask && morphResult.newWorkflowTask.id) {
      const wf = morphResult.newWorkflowTask
      const workflowId = wf.id // Narrowed by the guard above
      if (!workflowId) return // Satisfy TypeScript
      await tx.task.create({
        data: {
          id: workflowId,
          name: wf.name ?? 'Workflow',
          duration: wf.duration ?? 0,
          importance: wf.importance ?? 5,
          urgency: wf.urgency ?? 5,
          type: wf.type ?? '',
          category: 'work',
          hasSteps: true,
          overallStatus: wf.overallStatus ?? TaskStatus.NotStarted,
          criticalPathDuration: wf.criticalPathDuration ?? 0,
          worstCaseDuration: wf.worstCaseDuration ?? 0,
          archived: false,
          inActiveSprint: wf.inActiveSprint ?? false,
          sessionId: wf.sessionId ?? null,
          dependencies: JSON.stringify(wf.dependencies ?? []),
          asyncWaitTime: wf.asyncWaitTime ?? 0,
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    // 2. Create new steps (from morphed tasks)
    for (const stepData of morphResult.stepCreations) {
      // Check if this is a "revert to task" operation (nodeIdentityUpdates has matching entry with taskId)
      const isRevert = morphResult.nodeIdentityUpdates.some(
        (u) => u.taskId === stepData.id && u.stepId === null,
      )

      if (isRevert) {
        // Create a new standalone Task from step data
        await tx.task.create({
          data: {
            id: stepData.id,
            name: stepData.name,
            duration: stepData.duration,
            importance: stepData.importance,
            urgency: stepData.urgency,
            type: stepData.type,
            category: 'work',
            hasSteps: false,
            overallStatus: TaskStatus.NotStarted,
            asyncWaitTime: stepData.asyncWaitTime,
            cognitiveComplexity: stepData.cognitiveComplexity,
            notes: stepData.notes,
            dependencies: '[]',
            sessionId: null, // Will be set from the parent workflow's session
            createdAt: now,
            updatedAt: now,
          },
        })

        // Copy session ID from the source workflow
        const sourceWorkflow = await tx.task.findUnique({
          where: { id: stepData.taskId },
          select: { sessionId: true },
        })
        if (sourceWorkflow?.sessionId) {
          await tx.task.update({
            where: { id: stepData.id },
            data: { sessionId: sourceWorkflow.sessionId },
          })
        }
      } else {
        // Normal step creation
        await tx.taskStep.create({
          data: {
            id: stepData.id,
            taskId: stepData.taskId,
            name: stepData.name,
            duration: stepData.duration,
            type: stepData.type,
            dependsOn: JSON.stringify(stepData.dependsOn),
            stepIndex: stepData.stepIndex,
            asyncWaitTime: stepData.asyncWaitTime,
            cognitiveComplexity: stepData.cognitiveComplexity,
            notes: stepData.notes,
            importance: stepData.importance,
            urgency: stepData.urgency,
            status: StepStatus.Pending,
            percentComplete: 0,
          },
        })
      }
    }

    // 3. Update steps (add/remove dependsOn entries)
    for (const update of morphResult.stepUpdates) {
      await tx.taskStep.update({
        where: { id: update.id },
        data: {
          dependsOn: JSON.stringify(update.dependsOn),
        },
      })
    }

    // 4. Archive original tasks that became steps
    for (const taskId of morphResult.taskArchiveIds) {
      await tx.task.update({
        where: { id: taskId },
        data: {
          archived: true,
          updatedAt: now,
        },
      })
    }

    // 5. Reassign WorkSessions
    for (const wsUpdate of morphResult.workSessionUpdates) {
      await tx.workSession.updateMany({
        where: {
          taskId: wsUpdate.originalTaskId,
          ...(wsUpdate.newStepId ? { stepId: wsUpdate.newStepId } : {}),
        },
        data: {
          taskId: wsUpdate.newTaskId,
          stepId: wsUpdate.newStepId,
        },
      })
    }

    // 6. Update DeepWorkNode identities (taskId ↔ stepId)
    for (const nodeUpdate of morphResult.nodeIdentityUpdates) {
      await tx.deepWorkNode.update({
        where: { id: nodeUpdate.nodeId },
        data: {
          taskId: nodeUpdate.taskId,
          stepId: nodeUpdate.stepId,
          updatedAt: now,
        },
      })
    }

    // 7. Recalculate workflow metrics for affected workflows
    const affectedWorkflowIds = new Set<string>()
    for (const sc of morphResult.stepCreations) {
      affectedWorkflowIds.add(sc.taskId)
    }
    for (const su of morphResult.stepUpdates) {
      const step = await tx.taskStep.findUnique({
        where: { id: su.id },
        select: { taskId: true },
      })
      if (step) affectedWorkflowIds.add(step.taskId)
    }

    for (const workflowId of affectedWorkflowIds) {
      // Skip if the workflow was archived
      if (morphResult.taskArchiveIds.includes(workflowId)) continue

      const steps = await tx.taskStep.findMany({
        where: { taskId: workflowId },
        select: { id: true, duration: true, dependsOn: true },
      })

      const parsedSteps = steps.map((s) => ({
        id: s.id,
        duration: s.duration,
        dependsOn: JSON.parse(s.dependsOn || '[]') as string[],
      }))

      const metrics = recalculateWorkflowMetrics(parsedSteps)

      await tx.task.update({
        where: { id: workflowId },
        data: {
          duration: metrics.totalDuration,
          criticalPathDuration: metrics.criticalPathDuration,
          worstCaseDuration: metrics.totalDuration,
          updatedAt: now,
        },
      })
    }
  })
}

// =============================================================================
// Router
// =============================================================================

export const deepWorkBoardRouter = router({
  // ============================================================================
  // Board CRUD
  // ============================================================================

  /**
   * Get all boards for the current session
   */
  getAll: sessionProcedure.query(async ({ ctx }): Promise<DeepWorkBoard[]> => {
    const boards = await ctx.prisma.deepWorkBoard.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { createdAt: 'asc' },
    })
    return boards
  }),

  /**
   * Get a board with all its hydrated nodes
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }): Promise<{ board: DeepWorkBoard; nodes: DeepWorkNodeWithData[] } | null> => {
      const board = await ctx.prisma.deepWorkBoard.findUnique({
        where: { id: input.id },
        include: { nodes: true },
      })

      if (!board) return null

      const hydratedNodes = await Promise.all(
        board.nodes.map((node) => hydrateNode(ctx.prisma, node)),
      )

      const { nodes: _nodes, ...boardData } = board
      return { board: boardData, nodes: hydratedNodes }
    }),

  /**
   * Create a new board
   */
  create: sessionProcedure
    .input(createBoardInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkBoard> => {
      const now = getCurrentTime()
      const board = await ctx.prisma.deepWorkBoard.create({
        data: {
          id: generateUniqueId('dwb'),
          sessionId: ctx.sessionId,
          name: input.name,
          createdAt: now,
          updatedAt: now,
        },
      })
      return board
    }),

  /**
   * Update board metadata (name, panel state)
   */
  update: protectedProcedure
    .input(updateBoardInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkBoard> => {
      const { id, ...updates } = input
      const board = await ctx.prisma.deepWorkBoard.update({
        where: { id },
        data: {
          ...updates,
          updatedAt: getCurrentTime(),
        },
      })
      return board
    }),

  /**
   * Delete a board and all its nodes (cascade)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      await ctx.prisma.deepWorkBoard.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  // ============================================================================
  // Node Management
  // ============================================================================

  /**
   * Create a new standalone task and add it to the board as a node.
   * This is the "double-click to create" action.
   */
  createTaskAndNode: sessionProcedure
    .input(createTaskAndNodeInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkNodeWithData> => {
      const now = getCurrentTime()
      const taskId = generateUniqueId('task')
      const nodeId = generateUniqueId('dwn')

      // Get first user task type as default if none specified
      let taskType = input.type
      if (!taskType) {
        const firstType = await ctx.prisma.userTaskType.findFirst({
          where: { sessionId: ctx.sessionId },
          orderBy: { sortOrder: 'asc' },
        })
        taskType = firstType?.id ?? ''
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Create the standalone task
        const task = await tx.task.create({
          data: {
            id: taskId,
            name: input.name,
            duration: input.duration ?? 30,
            importance: input.importance ?? 5,
            urgency: input.urgency ?? 5,
            type: taskType,
            category: 'work',
            hasSteps: false,
            sessionId: ctx.sessionId,
            createdAt: now,
            updatedAt: now,
          },
          include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
        })

        // Create the node on the board
        const node = await tx.deepWorkNode.create({
          data: {
            id: nodeId,
            boardId: input.boardId,
            taskId: task.id,
            positionX: input.positionX,
            positionY: input.positionY,
            createdAt: now,
            updatedAt: now,
          },
        })

        return { task, node }
      })

      const formattedTask = formatTaskFromPrisma(result.task)

      return {
        ...result.node,
        task: formattedTask,
        step: null,
        parentTask: null,
      }
    }),

  /**
   * Add an existing task or step to the board as a node.
   * Used when importing from sprint or adding tasks from other views.
   */
  addNode: protectedProcedure
    .input(addExistingNodeInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkNodeWithData> => {
      if (!input.taskId && !input.stepId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either taskId or stepId must be provided',
        })
      }

      if (input.taskId && input.stepId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Provide either taskId or stepId, not both',
        })
      }

      const now = getCurrentTime()
      const node = await ctx.prisma.deepWorkNode.create({
        data: {
          id: generateUniqueId('dwn'),
          boardId: input.boardId,
          taskId: input.taskId ?? null,
          stepId: input.stepId ?? null,
          positionX: input.positionX,
          positionY: input.positionY,
          createdAt: now,
          updatedAt: now,
        },
      })

      return hydrateNode(ctx.prisma, node)
    }),

  /**
   * Update a single node's position (used during drag)
   */
  updateNodePosition: protectedProcedure
    .input(updateNodePositionInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkNode> => {
      const node = await ctx.prisma.deepWorkNode.update({
        where: { id: input.nodeId },
        data: {
          positionX: input.positionX,
          positionY: input.positionY,
          updatedAt: getCurrentTime(),
        },
      })
      return node
    }),

  /**
   * Batch update node positions (used after drag-multiple or auto-layout)
   */
  updateNodePositions: protectedProcedure
    .input(batchUpdateNodePositionsInput)
    .mutation(async ({ ctx, input }): Promise<{ count: number }> => {
      const now = getCurrentTime()
      await ctx.prisma.$transaction(
        input.updates.map((update) =>
          ctx.prisma.deepWorkNode.update({
            where: { id: update.nodeId },
            data: {
              positionX: update.positionX,
              positionY: update.positionY,
              updatedAt: now,
            },
          }),
        ),
      )
      return { count: input.updates.length }
    }),

  /**
   * Remove a node from the board (does NOT delete the underlying task)
   */
  removeNode: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      await ctx.prisma.deepWorkNode.delete({
        where: { id: input.nodeId },
      })
      return { success: true }
    }),

  // ============================================================================
  // Viewport
  // ============================================================================

  /**
   * Save canvas viewport (zoom, pan position)
   */
  saveViewport: protectedProcedure
    .input(saveViewportInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      await ctx.prisma.deepWorkBoard.update({
        where: { id: input.boardId },
        data: {
          zoom: input.zoom,
          panX: input.panX,
          panY: input.panY,
          updatedAt: getCurrentTime(),
        },
      })
      return { success: true }
    }),

  // ============================================================================
  // Edge Management (Connect / Disconnect with Morphing)
  // ============================================================================

  /**
   * Create a dependency edge between two nodes.
   * Triggers Task↔Step morphing when connecting standalone tasks.
   *
   * This is the core "draw a connection" action on the canvas.
   */
  createEdge: protectedProcedure
    .input(createEdgeInput)
    .mutation(async ({ ctx, input }): Promise<{ nodes: DeepWorkNodeWithData[] }> => {
      // 1. Load all board nodes for validation
      const boardNodes = await ctx.prisma.deepWorkNode.findMany({
        where: { boardId: input.boardId },
      })
      const hydratedNodes = await Promise.all(
        boardNodes.map((n) => hydrateNode(ctx.prisma, n)),
      )
      const nodeMap = new Map<string, DeepWorkNodeWithData>()
      for (const n of hydratedNodes) {
        nodeMap.set(n.id, n)
      }

      // 2. Derive current edges from node data
      const currentEdges = deriveEdgesFromHydratedNodes(hydratedNodes)

      // 3. Validate the proposed edge
      const validationError = validateEdgeCreation(
        input.sourceNodeId,
        input.targetNodeId,
        nodeMap,
        currentEdges,
      )
      if (validationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validationError })
      }

      const sourceNode = nodeMap.get(input.sourceNodeId)!
      const targetNode = nodeMap.get(input.targetNodeId)!

      // 4. Build the morph plan
      const morphResult = buildConnectMorphResult(sourceNode, targetNode, currentEdges)

      // 5. Execute the morph atomically
      await executeMorphResult(ctx.prisma, morphResult)

      // 6. Return updated board state
      const updatedBoardNodes = await ctx.prisma.deepWorkNode.findMany({
        where: { boardId: input.boardId },
      })
      const updatedHydrated = await Promise.all(
        updatedBoardNodes.map((n) => hydrateNode(ctx.prisma, n)),
      )

      return { nodes: updatedHydrated }
    }),

  /**
   * Remove a dependency edge between two nodes.
   * May trigger Step→Task un-morphing when a node becomes isolated.
   */
  removeEdge: protectedProcedure
    .input(removeEdgeInput)
    .mutation(async ({ ctx, input }): Promise<{ nodes: DeepWorkNodeWithData[] }> => {
      // 1. Load all board nodes
      const boardNodes = await ctx.prisma.deepWorkNode.findMany({
        where: { boardId: input.boardId },
      })
      const hydratedNodes = await Promise.all(
        boardNodes.map((n) => hydrateNode(ctx.prisma, n)),
      )
      const nodeMap = new Map<string, DeepWorkNodeWithData>()
      for (const n of hydratedNodes) {
        nodeMap.set(n.id, n)
      }

      const sourceNode = nodeMap.get(input.sourceNodeId)
      const targetNode = nodeMap.get(input.targetNodeId)

      if (!sourceNode || !targetNode) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node not found' })
      }

      // 2. Derive current edges
      const currentEdges = deriveEdgesFromHydratedNodes(hydratedNodes)

      // Find the specific edge being removed
      const removedEdge = currentEdges.find(
        (e) => e.sourceNodeId === input.sourceNodeId && e.targetNodeId === input.targetNodeId,
      )
      if (!removedEdge) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No edge found between these nodes' })
      }

      // 3. Build disconnect morph plan
      const morphResult = buildDisconnectMorphResult(
        sourceNode,
        targetNode,
        currentEdges,
        nodeMap,
        removedEdge,
      )

      // 4. Execute the morph
      await executeMorphResult(ctx.prisma, morphResult)

      // 5. Return updated board state
      const updatedBoardNodes = await ctx.prisma.deepWorkNode.findMany({
        where: { boardId: input.boardId },
      })
      const updatedHydrated = await Promise.all(
        updatedBoardNodes.map((n) => hydrateNode(ctx.prisma, n)),
      )

      return { nodes: updatedHydrated }
    }),

  // ============================================================================
  // Sprint Import
  // ============================================================================

  /**
   * Import all sprint tasks (inActiveSprint=true) onto the board.
   * Skips tasks already on the board. Auto-positions new nodes in a grid.
   */
  importFromSprint: sessionProcedure
    .input(importFromSprintInput)
    .mutation(async ({ ctx, input }): Promise<DeepWorkNodeWithData[]> => {
      // Get all sprint tasks
      const sprintTasks = await ctx.prisma.task.findMany({
        where: {
          sessionId: ctx.sessionId,
          inActiveSprint: true,
          archived: false,
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      // Get existing nodes on this board to avoid duplicates
      const existingNodes = await ctx.prisma.deepWorkNode.findMany({
        where: { boardId: input.boardId },
      })
      const existingTaskIds = new Set(existingNodes.filter((n) => n.taskId).map((n) => n.taskId))
      const existingStepIds = new Set(existingNodes.filter((n) => n.stepId).map((n) => n.stepId))

      // Find max X position for placing new nodes to the right of existing ones
      const maxX = existingNodes.length > 0
        ? Math.max(...existingNodes.map((n) => n.positionX)) + 300
        : 100
      const startY = 100
      const nodeSpacingX = 280
      const nodeSpacingY = 150
      const nodesPerRow = 4

      const now = getCurrentTime()
      const newNodes: DeepWorkNodeWithData[] = []
      let nodeIndex = 0

      for (const task of sprintTasks) {
        if (task.hasSteps && task.TaskStep.length > 0) {
          // Workflow: import each step as a separate node
          for (const step of task.TaskStep) {
            if (existingStepIds.has(step.id)) continue

            const col = nodeIndex % nodesPerRow
            const row = Math.floor(nodeIndex / nodesPerRow)
            const node = await ctx.prisma.deepWorkNode.create({
              data: {
                id: generateUniqueId('dwn'),
                boardId: input.boardId,
                stepId: step.id,
                positionX: maxX + col * nodeSpacingX,
                positionY: startY + row * nodeSpacingY,
                createdAt: now,
                updatedAt: now,
              },
            })
            newNodes.push(await hydrateNode(ctx.prisma, node))
            nodeIndex++
          }
        } else {
          // Standalone task
          if (existingTaskIds.has(task.id)) continue

          const col = nodeIndex % nodesPerRow
          const row = Math.floor(nodeIndex / nodesPerRow)
          const node = await ctx.prisma.deepWorkNode.create({
            data: {
              id: generateUniqueId('dwn'),
              boardId: input.boardId,
              taskId: task.id,
              positionX: maxX + col * nodeSpacingX,
              positionY: startY + row * nodeSpacingY,
              createdAt: now,
              updatedAt: now,
            },
          })
          newNodes.push(await hydrateNode(ctx.prisma, node))
          nodeIndex++
        }
      }

      return newNodes
    }),
})
