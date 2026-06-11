/**
 * Tests for the Deep Work Board router.
 *
 * Covers:
 *   - hydrateNode: task-node / step-node hydration (incl. parent workflow fetch),
 *     dangling references, and note-less passthrough.
 *   - deriveEdgesFromHydratedNodes: dependsOn-derived edges, intra/cross workflow
 *     classification, off-board dependency sources.
 *   - Board CRUD (getAll / getById / create / update / delete) via createCaller.
 *   - Node management (createTaskAndNode, addNode, position updates, removeNode).
 *   - Viewport persistence + Zod bounds.
 *   - createEdge / removeEdge morph orchestration: CreateWorkflow merge,
 *     validation rejections, and the revert-to-standalone-task disconnect path.
 *   - importFromSprint / importFromEndeavor grid placement + dedupe.
 *   - syncBoardToEndeavor: item back-fill + cross-workflow dependency creation.
 */

import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createMockContext, type MockPrisma } from './router-test-helpers'
import { appRouter } from '../index'
import { hydrateNode, deriveEdgesFromHydratedNodes } from '../deepWorkBoard'
import {
  formatTaskFromPrisma,
  formatStepFromPrisma,
  type PrismaTaskResult,
  type PrismaStepResult,
} from '../../../shared/deep-work-formatters'
import { DeepWorkEdgeType, type DeepWorkNodeWithData } from '../../../shared/deep-work-board-types'
import { EndeavorStatus } from '../../../shared/enums'

// =============================================================================
// Fixtures
// =============================================================================

const FIXED_DATE = new Date('2026-01-01T00:00:00Z')

function prismaTask(overrides: Partial<PrismaTaskResult> = {}): PrismaTaskResult {
  return {
    id: 'task-a',
    name: 'Task A',
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'type-dev',
    category: 'work',
    asyncWaitTime: 0,
    dependencies: '[]',
    completed: false,
    completedAt: null,
    actualDuration: null,
    notes: null,
    projectId: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    sessionId: 'test-session-id',
    deadline: null,
    deadlineType: null,
    cognitiveComplexity: null,
    isLocked: false,
    lockedStartTime: null,
    hasSteps: false,
    currentStepId: null,
    overallStatus: 'not_started',
    criticalPathDuration: 30,
    worstCaseDuration: 30,
    archived: false,
    inActiveSprint: false,
    TaskStep: [],
    ...overrides,
  }
}

function prismaStep(overrides: Partial<PrismaStepResult> = {}): PrismaStepResult {
  return {
    id: 'step-1',
    name: 'Step 1',
    duration: 15,
    type: 'type-dev',
    dependsOn: '[]',
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    taskId: 'wf-1',
    percentComplete: 0,
    actualDuration: null,
    startedAt: null,
    completedAt: null,
    notes: null,
    cognitiveComplexity: null,
    isAsyncTrigger: false,
    expectedResponseTime: null,
    importance: null,
    urgency: null,
    ...overrides,
  }
}

interface NodeRow {
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
}

function nodeRow(overrides: Partial<NodeRow> = {}): NodeRow {
  return {
    id: 'n1',
    boardId: 'board-1',
    taskId: null,
    stepId: null,
    positionX: 0,
    positionY: 0,
    width: 240,
    height: 120,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  }
}

function boardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'board-1',
    sessionId: 'test-session-id',
    name: 'Board',
    endeavorId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    actionPanelOpen: false,
    actionPanelWidth: 320,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  }
}

/** Hydrated step-node value for the pure edge-derivation tests. */
function stepNodeData(
  nodeId: string,
  step: PrismaStepResult,
  parent: PrismaTaskResult,
): DeepWorkNodeWithData {
  return {
    ...nodeRow({ id: nodeId, stepId: step.id }),
    task: null,
    step: formatStepFromPrisma(step),
    parentTask: formatTaskFromPrisma(parent),
  }
}

/** Hydrated standalone-task node value for the pure edge-derivation tests. */
function taskNodeData(nodeId: string, task: PrismaTaskResult): DeepWorkNodeWithData {
  return {
    ...nodeRow({ id: nodeId, taskId: task.id }),
    task: formatTaskFromPrisma(task),
    step: null,
    parentTask: null,
  }
}

// =============================================================================
// Mock prisma extension (board models are not in the shared helper)
// =============================================================================

function makeBoardModels() {
  return {
    deepWorkBoard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deepWorkNode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    endeavor: { findUnique: vi.fn() },
    endeavorItem: { findMany: vi.fn(), create: vi.fn() },
    endeavorDependency: { findMany: vi.fn(), create: vi.fn() },
  }
}

type BoardPrisma = MockPrisma &
  ReturnType<typeof makeBoardModels> & {
    userTaskType: { findFirst: Mock }
    workSession: { updateMany: Mock }
  }

function makeCtx() {
  const ctx = createMockContext()
  const prisma = Object.assign(
    ctx.prisma as unknown as MockPrisma,
    makeBoardModels(),
  ) as BoardPrisma

  // Methods the shared helper's models are missing but this router uses.
  Object.assign(prisma.userTaskType, { findFirst: vi.fn() })
  Object.assign(prisma.workSession, { updateMany: vi.fn() })

  // Session middleware (hasSession) verifies the session exists.
  prisma.session.findUnique.mockResolvedValue({ id: 'test-session-id', name: 'Test' })

  // Run transactions against THIS mock so per-test model configs apply
  // (the shared helper default runs against a fresh, unconfigured mock).
  ;(prisma.$transaction as Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: BoardPrisma) => unknown)(prisma)
    }
    return Promise.all(arg as Array<Promise<unknown>>)
  })

  const caller = appRouter.createCaller(ctx)
  return { ctx, prisma, caller }
}

/** Configure a findUnique-style mock to resolve rows by where.id. */
function byId(mock: Mock, rows: Array<{ id: string }>): void {
  mock.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
  )
}

/** Echo create() data back merged over a node row (mimics Prisma defaults). */
function echoNodeCreate(mock: Mock): void {
  mock.mockImplementation(({ data }: { data: Partial<NodeRow> }) =>
    Promise.resolve({ ...nodeRow(), ...data }),
  )
}

// =============================================================================
// hydrateNode
// =============================================================================

describe('hydrateNode', () => {
  it('hydrates a task node with its formatted task (parsed dependencies, mapped steps)', async () => {
    const { prisma } = makeCtx()
    prisma.task.findUnique.mockResolvedValue(
      prismaTask({
        id: 'task-a',
        dependencies: '["task-z"]',
        TaskStep: [prismaStep({ id: 's1', taskId: 'task-a' })],
      }),
    )

    const result = await hydrateNode(
      prisma as unknown as Parameters<typeof hydrateNode>[0],
      nodeRow({ id: 'n1', taskId: 'task-a' }),
    )

    expect(result.task?.id).toBe('task-a')
    expect(result.task?.dependencies).toEqual(['task-z']) // JSON parsed
    expect(result.task?.steps).toHaveLength(1)
    expect(result.step).toBeNull()
    expect(result.parentTask).toBeNull()
    // Steps fetched in stepIndex order alongside the task.
    expect(prisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-a' },
      include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
    })
  })

  it('hydrates a step node with the step AND its parent workflow task', async () => {
    const { prisma } = makeCtx()
    prisma.taskStep.findUnique.mockResolvedValue(
      prismaStep({ id: 's2', taskId: 'wf-1', dependsOn: '["s1"]' }),
    )
    prisma.task.findUnique.mockResolvedValue(prismaTask({ id: 'wf-1', hasSteps: true }))

    const result = await hydrateNode(
      prisma as unknown as Parameters<typeof hydrateNode>[0],
      nodeRow({ id: 'n2', stepId: 's2' }),
    )

    expect(result.task).toBeNull()
    expect(result.step?.id).toBe('s2')
    expect(result.step?.dependsOn).toEqual(['s1']) // JSON parsed
    expect(result.parentTask?.id).toBe('wf-1')
  })

  it('leaves task null when the referenced task no longer exists', async () => {
    const { prisma } = makeCtx()
    prisma.task.findUnique.mockResolvedValue(null)

    const result = await hydrateNode(
      prisma as unknown as Parameters<typeof hydrateNode>[0],
      nodeRow({ id: 'n1', taskId: 'task-gone' }),
    )

    expect(result.task).toBeNull()
    expect(result.step).toBeNull()
    expect(result.id).toBe('n1') // position metadata still passes through
  })

  it('does not query the database for a node with neither taskId nor stepId', async () => {
    const { prisma } = makeCtx()

    const result = await hydrateNode(
      prisma as unknown as Parameters<typeof hydrateNode>[0],
      nodeRow({ id: 'n0', positionX: 42, positionY: 7 }),
    )

    expect(prisma.task.findUnique).not.toHaveBeenCalled()
    expect(prisma.taskStep.findUnique).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'n0', positionX: 42, positionY: 7, task: null, step: null, parentTask: null })
  })
})

// =============================================================================
// deriveEdgesFromHydratedNodes
// =============================================================================

describe('deriveEdgesFromHydratedNodes', () => {
  const wf1 = prismaTask({ id: 'wf-1', hasSteps: true })
  const wf2 = prismaTask({ id: 'wf-2', hasSteps: true })

  it('derives an intra-workflow edge from a step dependsOn within the same workflow', () => {
    const n1 = stepNodeData('n1', prismaStep({ id: 's1', taskId: 'wf-1' }), wf1)
    const n2 = stepNodeData('n2', prismaStep({ id: 's2', taskId: 'wf-1', dependsOn: '["s1"]' }), wf1)

    const edges = deriveEdgesFromHydratedNodes([n1, n2])

    expect(edges).toEqual([
      {
        id: 'edge-n1-n2',
        sourceNodeId: 'n1',
        targetNodeId: 'n2',
        edgeType: DeepWorkEdgeType.IntraWorkflow,
      },
    ])
  })

  it('classifies an edge between steps of different workflows as cross-workflow', () => {
    const n1 = stepNodeData('n1', prismaStep({ id: 's1', taskId: 'wf-1' }), wf1)
    const n2 = stepNodeData('n2', prismaStep({ id: 's9', taskId: 'wf-2', dependsOn: '["s1"]' }), wf2)

    const edges = deriveEdgesFromHydratedNodes([n1, n2])

    expect(edges).toHaveLength(1)
    expect(edges[0]?.edgeType).toBe(DeepWorkEdgeType.CrossWorkflow)
  })

  it('skips dependencies whose source step is not on the board and yields none for task-only boards', () => {
    const offBoardDep = stepNodeData(
      'n2',
      prismaStep({ id: 's2', taskId: 'wf-1', dependsOn: '["s-not-on-board"]' }),
      wf1,
    )
    expect(deriveEdgesFromHydratedNodes([offBoardDep])).toEqual([])

    const taskOnly = [taskNodeData('a', prismaTask({ id: 'task-a' })), taskNodeData('b', prismaTask({ id: 'task-b' }))]
    expect(deriveEdgesFromHydratedNodes(taskOnly)).toEqual([])
  })
})

// =============================================================================
// Board CRUD
// =============================================================================

describe('deepWorkBoard router — board CRUD', () => {
  it('getAll returns the session boards, newest first', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.findMany.mockResolvedValue([boardRow({ id: 'board-2' }), boardRow()])

    const result = await caller.deepWorkBoard.getAll()

    expect(result.map((b) => b.id)).toEqual(['board-2', 'board-1'])
    expect(prisma.deepWorkBoard.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'test-session-id' },
      orderBy: { updatedAt: 'desc' },
    })
  })

  it('getById returns null for an unknown board', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.findUnique.mockResolvedValue(null)

    await expect(caller.deepWorkBoard.getById({ id: 'missing' })).resolves.toBeNull()
  })

  it('getById hydrates the board nodes and strips the raw nodes from board data', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.findUnique.mockResolvedValue({
      ...boardRow(),
      nodes: [nodeRow({ id: 'n1', taskId: 'task-a' })],
    })
    prisma.task.findUnique.mockResolvedValue(prismaTask({ id: 'task-a', name: 'Hydrated' }))

    const result = await caller.deepWorkBoard.getById({ id: 'board-1' })

    expect(result?.board.id).toBe('board-1')
    expect(result?.board).not.toHaveProperty('nodes')
    expect(result?.nodes).toHaveLength(1)
    expect(result?.nodes[0]?.task?.name).toBe('Hydrated')
  })

  it('create persists a session-scoped board with a dwb id and null endeavor by default', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    )

    const board = await caller.deepWorkBoard.create({ name: 'My Board' })

    expect(board.name).toBe('My Board')
    expect(board.sessionId).toBe('test-session-id')
    expect(board.endeavorId).toBeNull()
    expect(board.id.startsWith('dwb')).toBe(true)
  })

  it('create links the board to an endeavor when one is provided and rejects an empty name', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    )

    const board = await caller.deepWorkBoard.create({ name: 'Endeavor Board', endeavorId: 'end-1' })
    expect(board.endeavorId).toBe('end-1')

    await expect(caller.deepWorkBoard.create({ name: '' })).rejects.toThrow()
  })

  it('update writes only the provided fields plus updatedAt', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...boardRow({ id: where.id }), ...data }),
    )

    const result = await caller.deepWorkBoard.update({
      id: 'board-1',
      name: 'Renamed',
      actionPanelOpen: true,
    })

    expect(result.name).toBe('Renamed')
    expect(result.actionPanelOpen).toBe(true)
    const arg = prisma.deepWorkBoard.update.mock.calls[0]?.[0]
    expect(arg.where).toEqual({ id: 'board-1' })
    expect(arg.data.name).toBe('Renamed')
    expect(arg.data.actionPanelOpen).toBe(true)
    expect(arg.data.updatedAt).toBeInstanceOf(Date)
    expect(arg.data).not.toHaveProperty('id') // id never lands in the update payload
  })

  it('delete removes the board and reports success', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.delete.mockResolvedValue(boardRow())

    await expect(caller.deepWorkBoard.delete({ id: 'board-1' })).resolves.toEqual({ success: true })
    expect(prisma.deepWorkBoard.delete).toHaveBeenCalledWith({ where: { id: 'board-1' } })
  })
})

// =============================================================================
// Node management
// =============================================================================

describe('deepWorkBoard router — node management', () => {
  it('createTaskAndNode creates a standalone task + node with the explicit type and values', async () => {
    const { prisma, caller } = makeCtx()
    prisma.task.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...prismaTask(), ...data, TaskStep: [] }),
    )
    echoNodeCreate(prisma.deepWorkNode.create)

    const result = await caller.deepWorkBoard.createTaskAndNode({
      boardId: 'board-1',
      name: 'New Task',
      positionX: 10,
      positionY: 20,
      type: 'type-x',
      duration: 45,
      importance: 7,
      urgency: 8,
    })

    // No default-type lookup when a type is given.
    expect(prisma.userTaskType.findFirst).not.toHaveBeenCalled()

    const taskData = prisma.task.create.mock.calls[0]?.[0].data
    expect(taskData).toMatchObject({
      name: 'New Task',
      type: 'type-x',
      duration: 45,
      importance: 7,
      urgency: 8,
      hasSteps: false,
      sessionId: 'test-session-id',
    })

    expect(result.id.startsWith('dwn')).toBe(true)
    expect(result.boardId).toBe('board-1')
    expect(result.positionX).toBe(10)
    expect(result.positionY).toBe(20)
    expect(result.task?.name).toBe('New Task')
    expect(result.step).toBeNull()
    expect(result.parentTask).toBeNull()
  })

  it('createTaskAndNode falls back to the first user task type and 30/5/5 defaults', async () => {
    const { prisma, caller } = makeCtx()
    prisma.userTaskType.findFirst.mockResolvedValue({ id: 'type-first' })
    prisma.task.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...prismaTask(), ...data, TaskStep: [] }),
    )
    echoNodeCreate(prisma.deepWorkNode.create)

    await caller.deepWorkBoard.createTaskAndNode({
      boardId: 'board-1',
      name: 'Untyped',
      positionX: 0,
      positionY: 0,
    })

    expect(prisma.userTaskType.findFirst).toHaveBeenCalledWith({
      where: { sessionId: 'test-session-id' },
      orderBy: { sortOrder: 'asc' },
    })
    expect(prisma.task.create.mock.calls[0]?.[0].data).toMatchObject({
      type: 'type-first',
      duration: 30,
      importance: 5,
      urgency: 5,
    })
  })

  it('createTaskAndNode uses an empty type when the session has no task types', async () => {
    const { prisma, caller } = makeCtx()
    prisma.userTaskType.findFirst.mockResolvedValue(null)
    prisma.task.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...prismaTask(), ...data, TaskStep: [] }),
    )
    echoNodeCreate(prisma.deepWorkNode.create)

    await caller.deepWorkBoard.createTaskAndNode({
      boardId: 'board-1',
      name: 'Typeless',
      positionX: 0,
      positionY: 0,
    })

    expect(prisma.task.create.mock.calls[0]?.[0].data.type).toBe('')
  })

  it('addNode rejects when neither taskId nor stepId is given', async () => {
    const { prisma, caller } = makeCtx()

    await expect(
      caller.deepWorkBoard.addNode({ boardId: 'board-1', positionX: 0, positionY: 0 }),
    ).rejects.toThrow('Either taskId or stepId must be provided')
    expect(prisma.deepWorkNode.create).not.toHaveBeenCalled()
  })

  it('addNode rejects when both taskId and stepId are given', async () => {
    const { prisma, caller } = makeCtx()

    await expect(
      caller.deepWorkBoard.addNode({
        boardId: 'board-1',
        taskId: 'task-a',
        stepId: 's1',
        positionX: 0,
        positionY: 0,
      }),
    ).rejects.toThrow('Provide either taskId or stepId, not both')
    expect(prisma.deepWorkNode.create).not.toHaveBeenCalled()
  })

  it('addNode places an existing task on the board and returns it hydrated', async () => {
    const { prisma, caller } = makeCtx()
    echoNodeCreate(prisma.deepWorkNode.create)
    prisma.task.findUnique.mockResolvedValue(prismaTask({ id: 'task-a' }))

    const result = await caller.deepWorkBoard.addNode({
      boardId: 'board-1',
      taskId: 'task-a',
      positionX: 5,
      positionY: 6,
    })

    expect(prisma.deepWorkNode.create.mock.calls[0]?.[0].data).toMatchObject({
      boardId: 'board-1',
      taskId: 'task-a',
      stepId: null,
      positionX: 5,
      positionY: 6,
    })
    expect(result.task?.id).toBe('task-a')
    expect(result.step).toBeNull()
  })

  it('addNode places an existing step on the board hydrated with its parent workflow', async () => {
    const { prisma, caller } = makeCtx()
    echoNodeCreate(prisma.deepWorkNode.create)
    prisma.taskStep.findUnique.mockResolvedValue(prismaStep({ id: 's1', taskId: 'wf-1' }))
    prisma.task.findUnique.mockResolvedValue(prismaTask({ id: 'wf-1', hasSteps: true }))

    const result = await caller.deepWorkBoard.addNode({
      boardId: 'board-1',
      stepId: 's1',
      positionX: 1,
      positionY: 2,
    })

    expect(result.step?.id).toBe('s1')
    expect(result.parentTask?.id).toBe('wf-1')
    expect(result.task).toBeNull()
  })

  it('updateNodePosition persists the new coordinates', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkNode.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...nodeRow({ id: where.id }), ...data }),
    )

    const result = await caller.deepWorkBoard.updateNodePosition({
      nodeId: 'n1',
      positionX: 333,
      positionY: 444,
    })

    expect(result.positionX).toBe(333)
    expect(result.positionY).toBe(444)
    expect(prisma.deepWorkNode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' } }),
    )
  })

  it('updateNodePositions batches all updates in one transaction and returns the count', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkNode.update.mockResolvedValue(nodeRow())

    const result = await caller.deepWorkBoard.updateNodePositions({
      updates: [
        { nodeId: 'n1', positionX: 1, positionY: 2 },
        { nodeId: 'n2', positionX: 3, positionY: 4 },
      ],
    })

    expect(result).toEqual({ count: 2 })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.deepWorkNode.update).toHaveBeenCalledTimes(2)
    expect(prisma.deepWorkNode.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'n1' },
      data: { positionX: 1, positionY: 2 },
    })
    expect(prisma.deepWorkNode.update.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'n2' },
      data: { positionX: 3, positionY: 4 },
    })
  })

  it('removeNode deletes only the projection row', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkNode.delete.mockResolvedValue(nodeRow())

    await expect(caller.deepWorkBoard.removeNode({ nodeId: 'n1' })).resolves.toEqual({
      success: true,
    })
    expect(prisma.deepWorkNode.delete).toHaveBeenCalledWith({ where: { id: 'n1' } })
    // The underlying task is untouched.
    expect(prisma.task.delete).not.toHaveBeenCalled()
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('saveViewport persists zoom and pan, rejecting out-of-range zoom', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.update.mockResolvedValue(boardRow())

    const result = await caller.deepWorkBoard.saveViewport({
      boardId: 'board-1',
      zoom: 1.5,
      panX: -20,
      panY: 35,
    })

    expect(result).toEqual({ success: true })
    expect(prisma.deepWorkBoard.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'board-1' },
      data: { zoom: 1.5, panX: -20, panY: 35 },
    })

    await expect(
      caller.deepWorkBoard.saveViewport({ boardId: 'board-1', zoom: 0.01, panX: 0, panY: 0 }),
    ).rejects.toThrow()
    expect(prisma.deepWorkBoard.update).toHaveBeenCalledTimes(1) // no write on invalid input
  })
})

// =============================================================================
// Edge management (connect / disconnect morphs)
// =============================================================================

/** Board with one workflow (s1 ← s2 chain) projected as two step nodes. */
function setupWorkflowBoard(prisma: BoardPrisma): void {
  const wf = prismaTask({
    id: 'wf-1',
    name: 'Workflow',
    hasSteps: true,
    TaskStep: [
      prismaStep({ id: 's1', name: 'Step 1', taskId: 'wf-1', stepIndex: 0 }),
      prismaStep({ id: 's2', name: 'Step 2', taskId: 'wf-1', stepIndex: 1, dependsOn: '["s1"]' }),
    ],
  })
  byId(prisma.task.findUnique, [wf])
  byId(prisma.taskStep.findUnique, [
    prismaStep({ id: 's1', name: 'Step 1', taskId: 'wf-1', stepIndex: 0 }),
    prismaStep({ id: 's2', name: 'Step 2', taskId: 'wf-1', stepIndex: 1, dependsOn: '["s1"]' }),
  ])
  prisma.deepWorkNode.findMany.mockResolvedValue([
    nodeRow({ id: 'n1', stepId: 's1' }),
    nodeRow({ id: 'n2', stepId: 's2' }),
  ])
}

describe('deepWorkBoard router — createEdge', () => {
  it('connecting two standalone tasks creates a workflow, archives both, and swaps node identities', async () => {
    const { prisma, caller } = makeCtx()
    byId(prisma.task.findUnique, [
      prismaTask({ id: 'task-a', name: 'Design', duration: 20 }),
      prismaTask({ id: 'task-b', name: 'Build', duration: 40 }),
    ])
    prisma.deepWorkNode.findMany.mockResolvedValue([
      nodeRow({ id: 'n1', taskId: 'task-a' }),
      nodeRow({ id: 'n2', taskId: 'task-b' }),
    ])
    // Metrics recalculation reads the workflow's steps back inside the transaction.
    prisma.taskStep.findMany.mockResolvedValue([
      { id: 'sx', duration: 20, dependsOn: '[]' },
      { id: 'sy', duration: 40, dependsOn: JSON.stringify(['sx']) },
    ])

    const result = await caller.deepWorkBoard.createEdge({
      boardId: 'board-1',
      sourceNodeId: 'n1',
      targetNodeId: 'n2',
    })

    // New workflow container created from both task names.
    expect(prisma.task.create).toHaveBeenCalledTimes(1)
    expect(prisma.task.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Design → Build',
      hasSteps: true,
    })
    // Both originals become steps; the originals are archived.
    expect(prisma.taskStep.create).toHaveBeenCalledTimes(2)
    const archivedIds = prisma.task.update.mock.calls
      .filter((c) => c[0].data?.archived === true)
      .map((c) => c[0].where.id)
    expect(archivedIds).toEqual(expect.arrayContaining(['task-a', 'task-b']))
    // Node projection swapped taskId → stepId for both board nodes.
    expect(prisma.deepWorkNode.update).toHaveBeenCalledTimes(2)
    for (const call of prisma.deepWorkNode.update.mock.calls) {
      expect(call[0].data.taskId).toBeNull()
      expect(typeof call[0].data.stepId).toBe('string')
    }
    // Updated board state returned.
    expect(result.nodes).toHaveLength(2)
  })

  it('rejects a self-loop before touching the database', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkNode.findMany.mockResolvedValue([nodeRow({ id: 'n1', taskId: 'task-a' })])
    prisma.task.findUnique.mockResolvedValue(prismaTask({ id: 'task-a' }))

    await expect(
      caller.deepWorkBoard.createEdge({ boardId: 'board-1', sourceNodeId: 'n1', targetNodeId: 'n1' }),
    ).rejects.toThrow('Cannot create a dependency from a node to itself')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a duplicate of an existing derived dependency', async () => {
    const { prisma, caller } = makeCtx()
    setupWorkflowBoard(prisma)

    await expect(
      caller.deepWorkBoard.createEdge({ boardId: 'board-1', sourceNodeId: 'n1', targetNodeId: 'n2' }),
    ).rejects.toThrow('This dependency already exists')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects the reverse of an existing dependency', async () => {
    const { prisma, caller } = makeCtx()
    setupWorkflowBoard(prisma)

    await expect(
      caller.deepWorkBoard.createEdge({ boardId: 'board-1', sourceNodeId: 'n2', targetNodeId: 'n1' }),
    ).rejects.toThrow('A reverse dependency already exists between these nodes')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('deepWorkBoard router — removeEdge', () => {
  it('throws NOT_FOUND when either endpoint node is missing from the board', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkNode.findMany.mockResolvedValue([])

    await expect(
      caller.deepWorkBoard.removeEdge({ boardId: 'board-1', sourceNodeId: 'n1', targetNodeId: 'n2' }),
    ).rejects.toThrow('Source or target node not found')
  })

  it('throws NOT_FOUND when no derived edge exists between the nodes', async () => {
    const { prisma, caller } = makeCtx()
    byId(prisma.task.findUnique, [prismaTask({ id: 'task-a' }), prismaTask({ id: 'task-b' })])
    prisma.deepWorkNode.findMany.mockResolvedValue([
      nodeRow({ id: 'n1', taskId: 'task-a' }),
      nodeRow({ id: 'n2', taskId: 'task-b' }),
    ])

    await expect(
      caller.deepWorkBoard.removeEdge({ boardId: 'board-1', sourceNodeId: 'n1', targetNodeId: 'n2' }),
    ).rejects.toThrow('No edge found between these nodes')
  })

  it('removing the only edge of a two-step workflow reverts both steps to standalone tasks and archives the workflow', async () => {
    const { prisma, caller } = makeCtx()
    setupWorkflowBoard(prisma)

    const result = await caller.deepWorkBoard.removeEdge({
      boardId: 'board-1',
      sourceNodeId: 'n1',
      targetNodeId: 'n2',
    })

    // Each isolated step becomes a NEW standalone task carrying the step's data.
    const standaloneCreates = prisma.task.create.mock.calls.map((c) => c[0].data)
    expect(standaloneCreates).toHaveLength(2)
    for (const data of standaloneCreates) {
      expect(data.hasSteps).toBe(false)
    }
    expect(standaloneCreates.map((d) => d.name)).toEqual(
      expect.arrayContaining(['Step 1', 'Step 2']),
    )
    // The session id is copied over from the source workflow.
    const sessionCopies = prisma.task.update.mock.calls.filter(
      (c) => c[0].data?.sessionId === 'test-session-id',
    )
    expect(sessionCopies).toHaveLength(2)
    // The emptied workflow is archived.
    const archived = prisma.task.update.mock.calls.find((c) => c[0].data?.archived === true)
    expect(archived?.[0].where.id).toBe('wf-1')
    // Node projections swap back stepId → taskId.
    expect(prisma.deepWorkNode.update).toHaveBeenCalledTimes(2)
    for (const call of prisma.deepWorkNode.update.mock.calls) {
      expect(call[0].data.stepId).toBeNull()
      expect(typeof call[0].data.taskId).toBe('string')
    }
    expect(result.nodes).toHaveLength(2)
  })
})

// =============================================================================
// Sprint import
// =============================================================================

describe('deepWorkBoard router — importFromSprint', () => {
  it('imports workflow steps and standalone tasks, skipping ones already on the board, in a grid right of existing nodes', async () => {
    const { prisma, caller } = makeCtx()
    const wf = prismaTask({
      id: 'wf-1',
      hasSteps: true,
      TaskStep: [
        prismaStep({ id: 's1', taskId: 'wf-1', stepIndex: 0 }),
        prismaStep({ id: 's2', taskId: 'wf-1', stepIndex: 1 }),
      ],
    })
    const taskC = prismaTask({ id: 'task-c', name: 'New Solo' })
    const taskD = prismaTask({ id: 'task-d', name: 'Already Placed' })
    prisma.task.findMany.mockResolvedValue([wf, taskC, taskD])
    byId(prisma.task.findUnique, [wf, taskC, taskD])
    byId(prisma.taskStep.findUnique, [
      prismaStep({ id: 's1', taskId: 'wf-1' }),
      prismaStep({ id: 's2', taskId: 'wf-1' }),
    ])
    // s1 and task-d are already on the board; rightmost existing node at x=500.
    prisma.deepWorkNode.findMany.mockResolvedValue([
      nodeRow({ id: 'e1', stepId: 's1', positionX: 500 }),
      nodeRow({ id: 'e2', taskId: 'task-d', positionX: 200 }),
    ])
    echoNodeCreate(prisma.deepWorkNode.create)

    const result = await caller.deepWorkBoard.importFromSprint({ boardId: 'board-1' })

    // Only sprint, non-archived tasks are considered.
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'test-session-id', inActiveSprint: true, archived: false },
      }),
    )
    // Two new nodes: s2 then task-c (s1 + task-d deduped).
    expect(prisma.deepWorkNode.create).toHaveBeenCalledTimes(2)
    expect(prisma.deepWorkNode.create.mock.calls[0]?.[0].data).toMatchObject({
      stepId: 's2',
      positionX: 800, // maxX(500) + 300, col 0
      positionY: 100,
    })
    expect(prisma.deepWorkNode.create.mock.calls[1]?.[0].data).toMatchObject({
      taskId: 'task-c',
      positionX: 1080, // 800 + 280, col 1
      positionY: 100,
    })
    expect(result).toHaveLength(2)
    expect(result[0]?.step?.id).toBe('s2')
    expect(result[0]?.parentTask?.id).toBe('wf-1')
    expect(result[1]?.task?.id).toBe('task-c')
  })
})

// =============================================================================
// Endeavor import / sync
// =============================================================================

describe('deepWorkBoard router — importFromEndeavor', () => {
  function endeavorFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const wf = prismaTask({
      id: 'wf-1',
      hasSteps: true,
      TaskStep: [
        prismaStep({ id: 's1', taskId: 'wf-1', stepIndex: 0 }),
        prismaStep({ id: 's2', taskId: 'wf-1', stepIndex: 1 }),
      ],
    })
    return {
      id: 'end-1',
      name: 'My Endeavor',
      status: EndeavorStatus.Active,
      EndeavorItem: [
        { Task: wf },
        { Task: prismaTask({ id: 'task-c', name: 'Solo' }) },
        { Task: prismaTask({ id: 'task-x', archived: true }) },
      ],
      ...overrides,
    }
  }

  it('throws NOT_FOUND for an unknown endeavor', async () => {
    const { prisma, caller } = makeCtx()
    prisma.endeavor.findUnique.mockResolvedValue(null)

    await expect(caller.deepWorkBoard.importFromEndeavor({ endeavorId: 'missing' })).rejects.toThrow(
      'Endeavor not found',
    )
  })

  it('refuses to open an archived endeavor', async () => {
    const { prisma, caller } = makeCtx()
    prisma.endeavor.findUnique.mockResolvedValue(
      endeavorFixture({ status: EndeavorStatus.Archived }),
    )

    await expect(caller.deepWorkBoard.importFromEndeavor({ endeavorId: 'end-1' })).rejects.toThrow(
      'Cannot open archived endeavor in whiteboard',
    )
    expect(prisma.deepWorkBoard.create).not.toHaveBeenCalled()
  })

  it('creates a linked board named after the endeavor and imports steps + tasks, skipping archived tasks', async () => {
    const { prisma, caller } = makeCtx()
    prisma.endeavor.findUnique.mockResolvedValue(endeavorFixture())
    prisma.deepWorkBoard.findFirst.mockResolvedValue(null)
    prisma.deepWorkBoard.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    )
    prisma.deepWorkNode.findMany.mockResolvedValue([])
    echoNodeCreate(prisma.deepWorkNode.create)

    const result = await caller.deepWorkBoard.importFromEndeavor({ endeavorId: 'end-1' })

    const boardData = prisma.deepWorkBoard.create.mock.calls[0]?.[0].data
    expect(boardData).toMatchObject({
      name: 'My Endeavor',
      endeavorId: 'end-1',
      sessionId: 'test-session-id',
    })
    // s1, s2 and task-c imported on the empty-board grid; archived task-x skipped.
    expect(result.newNodeCount).toBe(3)
    expect(result.boardId.startsWith('dwb')).toBe(true)
    const created = prisma.deepWorkNode.create.mock.calls.map((c) => c[0].data)
    expect(created.map((d) => [d.positionX, d.positionY])).toEqual([
      [100, 100],
      [380, 100],
      [660, 100],
    ])
    expect(created.some((d) => d.taskId === 'task-x')).toBe(false)
  })

  it('reuses an existing board for the endeavor instead of creating a duplicate', async () => {
    const { prisma, caller } = makeCtx()
    prisma.endeavor.findUnique.mockResolvedValue(
      endeavorFixture({ EndeavorItem: [{ Task: prismaTask({ id: 'task-c' }) }] }),
    )
    prisma.deepWorkBoard.findFirst.mockResolvedValue(boardRow({ id: 'board-9', endeavorId: 'end-1' }))
    // The single endeavor task is already on the board.
    prisma.deepWorkNode.findMany.mockResolvedValue([nodeRow({ id: 'e1', taskId: 'task-c' })])

    const result = await caller.deepWorkBoard.importFromEndeavor({ endeavorId: 'end-1' })

    expect(prisma.deepWorkBoard.create).not.toHaveBeenCalled()
    expect(prisma.deepWorkNode.create).not.toHaveBeenCalled()
    expect(result).toEqual({ boardId: 'board-9', newNodeCount: 0 })
  })
})

describe('deepWorkBoard router — syncBoardToEndeavor', () => {
  /**
   * Board linked to end-1 with: a standalone task node, a step of wf-1, and two
   * steps of wf-2 (one depending cross-workflow on wf-1's step, one intra-workflow).
   * wf-1 is already an endeavor item.
   */
  function setupSyncBoard(prisma: BoardPrisma): void {
    prisma.deepWorkBoard.findUnique.mockResolvedValue(boardRow({ endeavorId: 'end-1' }))
    byId(prisma.task.findUnique, [
      prismaTask({ id: 'task-solo', name: 'Solo' }),
      prismaTask({ id: 'wf-1', hasSteps: true }),
      prismaTask({ id: 'wf-2', hasSteps: true }),
    ])
    byId(prisma.taskStep.findUnique, [
      prismaStep({ id: 'wf1-s1', taskId: 'wf-1' }),
      prismaStep({ id: 'wf2-s1', taskId: 'wf-2', dependsOn: '["wf1-s1"]' }),
      prismaStep({ id: 'wf2-s2', taskId: 'wf-2', dependsOn: '["wf2-s1"]', stepIndex: 1 }),
    ])
    prisma.deepWorkNode.findMany.mockResolvedValue([
      nodeRow({ id: 'nT', taskId: 'task-solo' }),
      nodeRow({ id: 'nS1', stepId: 'wf1-s1' }),
      nodeRow({ id: 'nS2', stepId: 'wf2-s1' }),
      nodeRow({ id: 'nS3', stepId: 'wf2-s2' }),
    ])
    prisma.endeavorItem.findMany.mockResolvedValue([
      { id: 'item-1', endeavorId: 'end-1', taskId: 'wf-1', sortOrder: 0, addedAt: FIXED_DATE },
    ])
    prisma.endeavorDependency.findMany.mockResolvedValue([])
  }

  it('throws NOT_FOUND for an unknown board', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.findUnique.mockResolvedValue(null)

    await expect(caller.deepWorkBoard.syncBoardToEndeavor({ boardId: 'missing' })).rejects.toThrow(
      'Board not found',
    )
  })

  it('rejects a board that is not linked to an endeavor', async () => {
    const { prisma, caller } = makeCtx()
    prisma.deepWorkBoard.findUnique.mockResolvedValue(boardRow({ endeavorId: null }))

    await expect(caller.deepWorkBoard.syncBoardToEndeavor({ boardId: 'board-1' })).rejects.toThrow(
      'Board is not linked to an endeavor',
    )
  })

  it('adds new board tasks as endeavor items and creates cross-workflow dependencies from step edges', async () => {
    const { prisma, caller } = makeCtx()
    setupSyncBoard(prisma)

    const result = await caller.deepWorkBoard.syncBoardToEndeavor({ boardId: 'board-1' })

    expect(result).toEqual({ addedTasks: 2, addedDependencies: 1 })

    // task-solo and wf-2 appended after the existing wf-1 item (sortOrder continues).
    const itemCreates = prisma.endeavorItem.create.mock.calls.map((c) => c[0].data)
    expect(itemCreates).toHaveLength(2)
    expect(itemCreates[0]).toMatchObject({ endeavorId: 'end-1', taskId: 'task-solo', sortOrder: 1 })
    expect(itemCreates[1]).toMatchObject({ endeavorId: 'end-1', taskId: 'wf-2', sortOrder: 2 })
    // wf-1 was already an item: never re-added.
    expect(itemCreates.some((d) => d.taskId === 'wf-1')).toBe(false)

    // Only the cross-workflow dep (wf1-s1 blocks wf2-s1) is materialized;
    // wf2-s2 → wf2-s1 is intra-workflow and skipped.
    expect(prisma.endeavorDependency.create).toHaveBeenCalledTimes(1)
    expect(prisma.endeavorDependency.create.mock.calls[0]?.[0].data).toMatchObject({
      endeavorId: 'end-1',
      blockingStepId: 'wf1-s1',
      blockingTaskId: 'wf-1',
      blockedStepId: 'wf2-s1',
      isHardBlock: true,
    })
  })

  it('does not duplicate a cross-workflow dependency that already exists', async () => {
    const { prisma, caller } = makeCtx()
    setupSyncBoard(prisma)
    prisma.endeavorDependency.findMany.mockResolvedValue([
      {
        id: 'd1',
        endeavorId: 'end-1',
        blockingStepId: 'wf1-s1',
        blockingTaskId: 'wf-1',
        blockedStepId: 'wf2-s1',
        blockedTaskId: null,
        isHardBlock: true,
        createdAt: FIXED_DATE,
      },
    ])

    const result = await caller.deepWorkBoard.syncBoardToEndeavor({ boardId: 'board-1' })

    expect(result.addedDependencies).toBe(0)
    expect(prisma.endeavorDependency.create).not.toHaveBeenCalled()
  })
})
