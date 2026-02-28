import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DeepWorkNodeWithData, DeepWorkEdge, DeepWorkBoard } from '@shared/deep-work-board-types'
import { DeepWorkEdgeType } from '@shared/deep-work-board-types'
import { StepStatus } from '@shared/enums'
import type { Task, TaskStep } from '@shared/types'

// =============================================================================
// Database Mock — must be set up before importing the store
// =============================================================================

const mockDb = {
  getDeepWorkBoards: vi.fn(),
  createDeepWorkBoard: vi.fn(),
  getDeepWorkBoardById: vi.fn(),
  deleteDeepWorkBoard: vi.fn(),
  updateDeepWorkBoard: vi.fn(),
  createDeepWorkTaskAndNode: vi.fn(),
  removeDeepWorkNode: vi.fn(),
  updateDeepWorkNodePositions: vi.fn(),
  createDeepWorkEdge: vi.fn(),
  removeDeepWorkEdge: vi.fn(),
  importDeepWorkFromSprint: vi.fn(),
  saveDeepWorkViewport: vi.fn(),
}

vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}))

vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    system: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  },
}))

// Import store and pure functions AFTER mocks are set up
import { useDeepWorkBoardStore, deriveEdgesFromNodes, computeActionableNodeIds, BoardLoadStatus } from '../useDeepWorkBoardStore'

// =============================================================================
// Test Helpers
// =============================================================================

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'focused',
    category: 'default',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: 'not_started' as any,
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    archived: false,
    inActiveSprint: false,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isLocked: false,
    ...overrides,
  }
}

function makeBoard(id: string, overrides: Partial<DeepWorkBoard> = {}): DeepWorkBoard {
  return {
    id,
    sessionId: 'session-1',
    name: `Board ${id}`,
    zoom: 1,
    panX: 0,
    panY: 0,
    actionPanelOpen: true,
    actionPanelWidth: 300,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeTaskNode(
  nodeId: string,
  task: Task,
  overrides: Partial<DeepWorkNodeWithData> = {},
): DeepWorkNodeWithData {
  return {
    id: nodeId,
    boardId: 'board-1',
    taskId: task.id,
    stepId: null,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    task,
    step: null,
    parentTask: null,
    ...overrides,
  }
}

function makeStepNode(
  nodeId: string,
  step: TaskStep,
  parentTask: Task,
): DeepWorkNodeWithData {
  return {
    id: nodeId,
    boardId: 'board-1',
    taskId: null,
    stepId: step.id,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    task: null,
    step,
    parentTask,
  }
}

function makeStep(
  id: string,
  taskId: string,
  overrides: Partial<TaskStep> = {},
): TaskStep {
  return {
    id,
    name: `Step ${id}`,
    duration: 15,
    type: 'focused',
    taskId,
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    isAsyncTrigger: false,
    ...overrides,
  }
}

// =============================================================================
// Pure Functions: deriveEdgesFromNodes
// =============================================================================

describe('deriveEdgesFromNodes', () => {
  it('returns empty array for empty node map', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    expect(deriveEdgesFromNodes(nodes)).toEqual([])
  })

  it('returns empty array for nodes with no dependencies', () => {
    const t1 = makeTask('task-A')
    const t2 = makeTask('task-B')
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', t1)],
      ['n2', makeTaskNode('n2', t2)],
    ])
    expect(deriveEdgesFromNodes(nodes)).toEqual([])
  })

  it('derives intra-workflow edges from step dependsOn', () => {
    const parentTask = makeTask('wf-1', { hasSteps: true })
    const stepA = makeStep('step-a', 'wf-1')
    const stepB = makeStep('step-b', 'wf-1', { dependsOn: ['step-a'] })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeStepNode('n1', stepA, parentTask)],
      ['n2', makeStepNode('n2', stepB, parentTask)],
    ])
    const edges = deriveEdgesFromNodes(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.sourceNodeId).toBe('n1')
    expect(edges[0]!.targetNodeId).toBe('n2')
    expect(edges[0]!.edgeType).toBe(DeepWorkEdgeType.IntraWorkflow)
  })

  it('derives cross-workflow edges when steps are in different workflows', () => {
    const wf1 = makeTask('wf-1', { hasSteps: true })
    const wf2 = makeTask('wf-2', { hasSteps: true })
    const stepA = makeStep('step-a', 'wf-1')
    const stepB = makeStep('step-b', 'wf-2', { dependsOn: ['step-a'] })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeStepNode('n1', stepA, wf1)],
      ['n2', makeStepNode('n2', stepB, wf2)],
    ])
    const edges = deriveEdgesFromNodes(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.edgeType).toBe(DeepWorkEdgeType.CrossWorkflow)
  })

  it('derives edges from standalone task dependencies', () => {
    const t1 = makeTask('task-A')
    const t2 = makeTask('task-B', { dependencies: ['task-A'] })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', t1)],
      ['n2', makeTaskNode('n2', t2)],
    ])
    const edges = deriveEdgesFromNodes(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.sourceNodeId).toBe('n1')
    expect(edges[0]!.targetNodeId).toBe('n2')
  })

  it('ignores task dependencies for workflow tasks (hasSteps=true)', () => {
    const t1 = makeTask('task-A')
    const t2 = makeTask('task-B', { hasSteps: true, dependencies: ['task-A'] })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', t1)],
      ['n2', makeTaskNode('n2', t2)],
    ])
    expect(deriveEdgesFromNodes(nodes)).toEqual([])
  })

  it('ignores step dependencies referencing nodes not on the board', () => {
    const parentTask = makeTask('wf-1', { hasSteps: true })
    const stepB = makeStep('step-b', 'wf-1', { dependsOn: ['step-missing'] })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n2', makeStepNode('n2', stepB, parentTask)],
    ])
    expect(deriveEdgesFromNodes(nodes)).toEqual([])
  })

  it('handles mixed task and step nodes', () => {
    const parentTask = makeTask('wf-1', { hasSteps: true })
    const stepA = makeStep('step-a', 'wf-1')
    const stepB = makeStep('step-b', 'wf-1', { dependsOn: ['step-a'] })
    const standalone = makeTask('task-C', { dependencies: ['task-D'] })
    const depTask = makeTask('task-D')
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeStepNode('n1', stepA, parentTask)],
      ['n2', makeStepNode('n2', stepB, parentTask)],
      ['n3', makeTaskNode('n3', standalone)],
      ['n4', makeTaskNode('n4', depTask)],
    ])
    expect(deriveEdgesFromNodes(nodes)).toHaveLength(2)
  })
})

// =============================================================================
// Pure Functions: computeActionableNodeIds
// =============================================================================

describe('computeActionableNodeIds', () => {
  it('returns all node IDs when no edges exist', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', makeTask('task-A'))],
      ['n2', makeTaskNode('n2', makeTask('task-B'))],
    ])
    const result = computeActionableNodeIds(nodes, [])
    expect(result.size).toBe(2)
  })

  it('excludes completed task nodes', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', makeTask('task-A', { completed: true }))],
      ['n2', makeTaskNode('n2', makeTask('task-B'))],
    ])
    const result = computeActionableNodeIds(nodes, [])
    expect(result.has('n1')).toBe(false)
    expect(result.has('n2')).toBe(true)
  })

  it('excludes completed and skipped step nodes', () => {
    const parentTask = makeTask('wf-1', { hasSteps: true })
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeStepNode('n1', makeStep('step-a', 'wf-1', { status: StepStatus.Completed }), parentTask)],
      ['n2', makeStepNode('n2', makeStep('step-b', 'wf-1', { status: StepStatus.Skipped }), parentTask)],
      ['n3', makeStepNode('n3', makeStep('step-c', 'wf-1'), parentTask)],
    ])
    const result = computeActionableNodeIds(nodes, [])
    expect(result.has('n1')).toBe(false)
    expect(result.has('n2')).toBe(false)
    expect(result.has('n3')).toBe(true)
  })

  it('blocks nodes with incomplete dependencies', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', makeTask('task-A'))],
      ['n2', makeTaskNode('n2', makeTask('task-B'))],
    ])
    const edges: DeepWorkEdge[] = [{
      id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', edgeType: DeepWorkEdgeType.IntraWorkflow,
    }]
    const result = computeActionableNodeIds(nodes, edges)
    expect(result.has('n1')).toBe(true)
    expect(result.has('n2')).toBe(false)
  })

  it('unblocks nodes when all dependencies completed', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', makeTask('task-A', { completed: true }))],
      ['n2', makeTaskNode('n2', makeTask('task-B'))],
    ])
    const edges: DeepWorkEdge[] = [{
      id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', edgeType: DeepWorkEdgeType.IntraWorkflow,
    }]
    const result = computeActionableNodeIds(nodes, edges)
    expect(result.has('n2')).toBe(true)
  })

  it('requires ALL dependencies to be completed', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>([
      ['n1', makeTaskNode('n1', makeTask('task-A', { completed: true }))],
      ['n2', makeTaskNode('n2', makeTask('task-B'))],
      ['n3', makeTaskNode('n3', makeTask('task-C'))],
    ])
    const edges: DeepWorkEdge[] = [
      { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n3', edgeType: DeepWorkEdgeType.IntraWorkflow },
      { id: 'e2', sourceNodeId: 'n2', targetNodeId: 'n3', edgeType: DeepWorkEdgeType.IntraWorkflow },
    ]
    const result = computeActionableNodeIds(nodes, edges)
    expect(result.has('n3')).toBe(false)
  })

  it('handles empty node map', () => {
    const result = computeActionableNodeIds(new Map(), [])
    expect(result.size).toBe(0)
  })
})

// =============================================================================
// Store Actions (with mocked database)
// =============================================================================

describe('useDeepWorkBoardStore actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useDeepWorkBoardStore.setState({
      boards: [],
      activeBoardId: null,
      activeBoard: null,
      status: BoardLoadStatus.Idle,
      error: null,
      nodes: new Map(),
      edges: [],
      clusters: [],
      actionableNodeIds: new Set(),
      actionPanelOpen: true,
      actionPanelFilter: null,
      expandedNodeId: null,
      pendingPositionUpdates: new Map(),
      positionFlushTimer: null,
      viewportFlushTimer: null,
    })
  })

  // ---------- Board Lifecycle ----------

  describe('loadBoards', () => {
    it('loads boards and sets status to Loaded', async () => {
      const boards = [makeBoard('b1'), makeBoard('b2')]
      mockDb.getDeepWorkBoards.mockResolvedValue(boards)

      await useDeepWorkBoardStore.getState().loadBoards()

      const state = useDeepWorkBoardStore.getState()
      expect(state.boards).toEqual(boards)
      expect(state.status).toBe(BoardLoadStatus.Loaded)
    })

    it('sets error status on failure', async () => {
      mockDb.getDeepWorkBoards.mockRejectedValue(new Error('Network error'))

      await useDeepWorkBoardStore.getState().loadBoards()

      const state = useDeepWorkBoardStore.getState()
      expect(state.status).toBe(BoardLoadStatus.Error)
      expect(state.error).toBe('Network error')
    })
  })

  describe('createBoard', () => {
    it('creates board, sets it active, and clears nodes', async () => {
      const newBoard = makeBoard('new-board')
      mockDb.createDeepWorkBoard.mockResolvedValue(newBoard)

      const boardId = await useDeepWorkBoardStore.getState().createBoard('My Board')

      expect(boardId).toBe('new-board')
      const state = useDeepWorkBoardStore.getState()
      expect(state.activeBoardId).toBe('new-board')
      expect(state.activeBoard).toEqual(newBoard)
      expect(state.nodes.size).toBe(0)
      expect(state.boards).toHaveLength(1)
    })
  })

  describe('switchBoard', () => {
    it('fetches board data, derives edges and actionable nodes', async () => {
      const board = makeBoard('b1')
      const nodeA = makeTaskNode('n1', makeTask('task-A'))
      const nodeB = makeTaskNode('n2', makeTask('task-B'))
      mockDb.getDeepWorkBoardById.mockResolvedValue({
        board,
        nodes: [nodeA, nodeB],
      })
      mockDb.updateDeepWorkNodePositions.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().switchBoard('b1')

      const state = useDeepWorkBoardStore.getState()
      expect(state.activeBoardId).toBe('b1')
      expect(state.nodes.size).toBe(2)
      expect(state.actionableNodeIds.size).toBe(2)
      expect(state.status).toBe(BoardLoadStatus.Loaded)
    })

    it('sets error when board not found', async () => {
      mockDb.getDeepWorkBoardById.mockResolvedValue(null)
      mockDb.updateDeepWorkNodePositions.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().switchBoard('nonexistent')

      const state = useDeepWorkBoardStore.getState()
      expect(state.status).toBe(BoardLoadStatus.Error)
      expect(state.error).toBe('Board not found')
    })

    it('handles fetch failure', async () => {
      mockDb.getDeepWorkBoardById.mockRejectedValue(new Error('DB down'))
      mockDb.updateDeepWorkNodePositions.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().switchBoard('b1')

      const state = useDeepWorkBoardStore.getState()
      expect(state.status).toBe(BoardLoadStatus.Error)
      expect(state.error).toBe('DB down')
    })
  })

  describe('deleteBoard', () => {
    it('removes the board and clears active if it was active', async () => {
      const board = makeBoard('b1')
      useDeepWorkBoardStore.setState({
        boards: [board],
        activeBoardId: 'b1',
        activeBoard: board,
      })
      mockDb.deleteDeepWorkBoard.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().deleteBoard('b1')

      const state = useDeepWorkBoardStore.getState()
      expect(state.boards).toHaveLength(0)
      expect(state.activeBoardId).toBeNull()
      expect(state.activeBoard).toBeNull()
    })

    it('does not clear active when deleting a non-active board', async () => {
      const board1 = makeBoard('b1')
      const board2 = makeBoard('b2')
      useDeepWorkBoardStore.setState({
        boards: [board1, board2],
        activeBoardId: 'b1',
        activeBoard: board1,
      })
      mockDb.deleteDeepWorkBoard.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().deleteBoard('b2')

      const state = useDeepWorkBoardStore.getState()
      expect(state.boards).toHaveLength(1)
      expect(state.activeBoardId).toBe('b1')
    })
  })

  describe('updateBoardName', () => {
    it('updates the active board name', async () => {
      const board = makeBoard('b1', { name: 'Old Name' })
      const updated = makeBoard('b1', { name: 'New Name' })
      useDeepWorkBoardStore.setState({
        boards: [board],
        activeBoardId: 'b1',
        activeBoard: board,
      })
      mockDb.updateDeepWorkBoard.mockResolvedValue(updated)

      await useDeepWorkBoardStore.getState().updateBoardName('New Name')

      const state = useDeepWorkBoardStore.getState()
      expect(state.activeBoard?.name).toBe('New Name')
      expect(state.boards[0]?.name).toBe('New Name')
    })

    it('does nothing when no active board', async () => {
      await useDeepWorkBoardStore.getState().updateBoardName('Name')
      expect(mockDb.updateDeepWorkBoard).not.toHaveBeenCalled()
    })
  })

  // ---------- Node Operations ----------

  describe('addNode', () => {
    it('creates node via DB and adds to state', async () => {
      const node = makeTaskNode('n1', makeTask('task-A'))
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.createDeepWorkTaskAndNode.mockResolvedValue(node)

      const result = await useDeepWorkBoardStore.getState().addNode({ x: 100, y: 200 }, 'New Task')

      expect(result.id).toBe('n1')
      expect(useDeepWorkBoardStore.getState().nodes.has('n1')).toBe(true)
      expect(mockDb.createDeepWorkTaskAndNode).toHaveBeenCalledWith({
        boardId: 'b1',
        name: 'New Task',
        positionX: 100,
        positionY: 200,
      })
    })

    it('throws when no active board', async () => {
      await expect(
        useDeepWorkBoardStore.getState().addNode({ x: 0, y: 0 }, 'Task'),
      ).rejects.toThrow('No active board')
    })
  })

  describe('removeNode', () => {
    it('removes node from state and recalculates edges', async () => {
      const node = makeTaskNode('n1', makeTask('task-A'))
      useDeepWorkBoardStore.setState({
        nodes: new Map([['n1', node]]),
        actionableNodeIds: new Set(['n1']),
      })
      mockDb.removeDeepWorkNode.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().removeNode('n1')

      expect(useDeepWorkBoardStore.getState().nodes.has('n1')).toBe(false)
    })

    it('clears expandedNodeId if the removed node was expanded', async () => {
      const node = makeTaskNode('n1', makeTask('task-A'))
      useDeepWorkBoardStore.setState({
        nodes: new Map([['n1', node]]),
        expandedNodeId: 'n1',
      })
      mockDb.removeDeepWorkNode.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().removeNode('n1')

      expect(useDeepWorkBoardStore.getState().expandedNodeId).toBeNull()
    })
  })

  describe('moveNode', () => {
    it('updates node position optimistically', () => {
      const node = makeTaskNode('n1', makeTask('task-A'), { positionX: 0, positionY: 0 })
      useDeepWorkBoardStore.setState({
        nodes: new Map([['n1', node]]),
      })

      useDeepWorkBoardStore.getState().moveNode('n1', { x: 100, y: 200 })

      const updatedNode = useDeepWorkBoardStore.getState().nodes.get('n1')
      expect(updatedNode?.positionX).toBe(100)
      expect(updatedNode?.positionY).toBe(200)
    })

    it('tracks pending position updates for debounced flush', () => {
      const node = makeTaskNode('n1', makeTask('task-A'))
      useDeepWorkBoardStore.setState({
        nodes: new Map([['n1', node]]),
      })

      useDeepWorkBoardStore.getState().moveNode('n1', { x: 50, y: 60 })

      const pending = useDeepWorkBoardStore.getState().pendingPositionUpdates
      expect(pending.has('n1')).toBe(true)
      expect(pending.get('n1')).toEqual({ positionX: 50, positionY: 60 })
    })

    it('does nothing for non-existent node', () => {
      useDeepWorkBoardStore.setState({ nodes: new Map() })

      useDeepWorkBoardStore.getState().moveNode('nonexistent', { x: 100, y: 200 })

      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(0)
    })
  })

  describe('moveNodes', () => {
    it('batch updates multiple node positions', () => {
      const n1 = makeTaskNode('n1', makeTask('task-A'))
      const n2 = makeTaskNode('n2', makeTask('task-B'))
      useDeepWorkBoardStore.setState({
        nodes: new Map([['n1', n1], ['n2', n2]]),
      })

      useDeepWorkBoardStore.getState().moveNodes([
        { nodeId: 'n1', position: { x: 10, y: 20 } },
        { nodeId: 'n2', position: { x: 30, y: 40 } },
      ])

      const state = useDeepWorkBoardStore.getState()
      expect(state.nodes.get('n1')?.positionX).toBe(10)
      expect(state.nodes.get('n2')?.positionX).toBe(30)
      expect(state.pendingPositionUpdates.size).toBe(2)
    })
  })

  describe('flushPositionUpdates', () => {
    it('sends pending updates to DB and clears them', async () => {
      useDeepWorkBoardStore.setState({
        pendingPositionUpdates: new Map([
          ['n1', { positionX: 100, positionY: 200 }],
        ]),
      })
      mockDb.updateDeepWorkNodePositions.mockResolvedValue(undefined)

      await useDeepWorkBoardStore.getState().flushPositionUpdates()

      expect(mockDb.updateDeepWorkNodePositions).toHaveBeenCalledWith({
        updates: [{ nodeId: 'n1', positionX: 100, positionY: 200 }],
      })
      expect(useDeepWorkBoardStore.getState().pendingPositionUpdates.size).toBe(0)
    })

    it('does nothing when no pending updates', async () => {
      await useDeepWorkBoardStore.getState().flushPositionUpdates()
      expect(mockDb.updateDeepWorkNodePositions).not.toHaveBeenCalled()
    })

    it('handles DB errors gracefully', async () => {
      useDeepWorkBoardStore.setState({
        pendingPositionUpdates: new Map([
          ['n1', { positionX: 100, positionY: 200 }],
        ]),
      })
      mockDb.updateDeepWorkNodePositions.mockRejectedValue(new Error('DB error'))

      // Should not throw
      await useDeepWorkBoardStore.getState().flushPositionUpdates()
      expect(useDeepWorkBoardStore.getState().pendingPositionUpdates.size).toBe(0)
    })
  })

  // ---------- Edge Operations ----------

  describe('connectNodes', () => {
    it('calls DB and replaces nodes with response', async () => {
      const nodeA = makeTaskNode('n1', makeTask('task-A'))
      const nodeB = makeTaskNode('n2', makeTask('task-B'))
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.createDeepWorkEdge.mockResolvedValue({
        nodes: [nodeA, nodeB],
      })

      await useDeepWorkBoardStore.getState().connectNodes('n1', 'n2')

      expect(mockDb.createDeepWorkEdge).toHaveBeenCalledWith({
        boardId: 'b1', sourceNodeId: 'n1', targetNodeId: 'n2',
      })
      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(2)
    })

    it('does nothing when no active board', async () => {
      await useDeepWorkBoardStore.getState().connectNodes('n1', 'n2')
      expect(mockDb.createDeepWorkEdge).not.toHaveBeenCalled()
    })
  })

  describe('disconnectNodes', () => {
    it('calls DB and replaces nodes with response', async () => {
      const nodeA = makeTaskNode('n1', makeTask('task-A'))
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.removeDeepWorkEdge.mockResolvedValue({
        nodes: [nodeA],
      })

      await useDeepWorkBoardStore.getState().disconnectNodes('n1', 'n2')

      expect(mockDb.removeDeepWorkEdge).toHaveBeenCalledWith({
        boardId: 'b1', sourceNodeId: 'n1', targetNodeId: 'n2',
      })
      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(1)
    })

    it('does nothing when no active board', async () => {
      await useDeepWorkBoardStore.getState().disconnectNodes('n1', 'n2')
      expect(mockDb.removeDeepWorkEdge).not.toHaveBeenCalled()
    })
  })

  // ---------- Import ----------

  describe('importFromSprint', () => {
    it('imports nodes from sprint and returns count', async () => {
      const imported = [
        makeTaskNode('n1', makeTask('task-A')),
        makeTaskNode('n2', makeTask('task-B')),
      ]
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.importDeepWorkFromSprint.mockResolvedValue(imported)

      const count = await useDeepWorkBoardStore.getState().importFromSprint()

      expect(count).toBe(2)
      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(2)
    })

    it('returns 0 when no active board', async () => {
      const count = await useDeepWorkBoardStore.getState().importFromSprint()
      expect(count).toBe(0)
    })
  })

  // ---------- Action Panel ----------

  describe('toggleActionPanel', () => {
    it('toggles action panel open state', () => {
      useDeepWorkBoardStore.setState({ actionPanelOpen: true, activeBoardId: 'b1' })
      mockDb.updateDeepWorkBoard.mockResolvedValue(undefined)

      useDeepWorkBoardStore.getState().toggleActionPanel()

      expect(useDeepWorkBoardStore.getState().actionPanelOpen).toBe(false)
    })

    it('toggles back to open', () => {
      useDeepWorkBoardStore.setState({ actionPanelOpen: false, activeBoardId: 'b1' })
      mockDb.updateDeepWorkBoard.mockResolvedValue(undefined)

      useDeepWorkBoardStore.getState().toggleActionPanel()

      expect(useDeepWorkBoardStore.getState().actionPanelOpen).toBe(true)
    })
  })

  describe('setActionPanelFilter', () => {
    it('sets filter cluster ID', () => {
      useDeepWorkBoardStore.getState().setActionPanelFilter('cluster-1')
      expect(useDeepWorkBoardStore.getState().actionPanelFilter).toBe('cluster-1')
    })

    it('clears filter with null', () => {
      useDeepWorkBoardStore.setState({ actionPanelFilter: 'cluster-1' })
      useDeepWorkBoardStore.getState().setActionPanelFilter(null)
      expect(useDeepWorkBoardStore.getState().actionPanelFilter).toBeNull()
    })
  })

  // ---------- Node Detail Panel ----------

  describe('expandNode', () => {
    it('sets expandedNodeId', () => {
      useDeepWorkBoardStore.getState().expandNode('n1')
      expect(useDeepWorkBoardStore.getState().expandedNodeId).toBe('n1')
    })
  })

  describe('collapseNodePanel', () => {
    it('clears expandedNodeId', () => {
      useDeepWorkBoardStore.setState({ expandedNodeId: 'n1' })
      useDeepWorkBoardStore.getState().collapseNodePanel()
      expect(useDeepWorkBoardStore.getState().expandedNodeId).toBeNull()
    })
  })

  // ---------- Derived State ----------

  describe('recomputeEdges', () => {
    it('recomputes edges and actionable nodes from current state', () => {
      const t1 = makeTask('task-A')
      const t2 = makeTask('task-B', { dependencies: ['task-A'] })
      useDeepWorkBoardStore.setState({
        nodes: new Map([
          ['n1', makeTaskNode('n1', t1)],
          ['n2', makeTaskNode('n2', t2)],
        ]),
        edges: [],
        actionableNodeIds: new Set(),
      })

      useDeepWorkBoardStore.getState().recomputeEdges()

      const state = useDeepWorkBoardStore.getState()
      expect(state.edges).toHaveLength(1)
      expect(state.actionableNodeIds.has('n1')).toBe(true)
      expect(state.actionableNodeIds.has('n2')).toBe(false)
    })
  })

  describe('recomputeActionable', () => {
    it('recomputes actionable node IDs from current edges', () => {
      const t1 = makeTask('task-A', { completed: true })
      const t2 = makeTask('task-B')
      const edges: DeepWorkEdge[] = [{
        id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', edgeType: DeepWorkEdgeType.IntraWorkflow,
      }]
      useDeepWorkBoardStore.setState({
        nodes: new Map([
          ['n1', makeTaskNode('n1', t1)],
          ['n2', makeTaskNode('n2', t2)],
        ]),
        edges,
        actionableNodeIds: new Set(),
      })

      useDeepWorkBoardStore.getState().recomputeActionable()

      expect(useDeepWorkBoardStore.getState().actionableNodeIds.has('n2')).toBe(true)
    })
  })

  // ---------- Refresh Nodes ----------

  describe('refreshNodes', () => {
    it('re-fetches nodes from DB and recomputes edges', async () => {
      const t1 = makeTask('task-A')
      const t2 = makeTask('task-B', { dependencies: ['task-A'] })
      const board = makeBoard('b1')
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1', activeBoard: board })
      mockDb.getDeepWorkBoardById.mockResolvedValue({
        board,
        nodes: [makeTaskNode('n1', t1), makeTaskNode('n2', t2)],
      })

      await useDeepWorkBoardStore.getState().refreshNodes()

      const state = useDeepWorkBoardStore.getState()
      expect(state.nodes.size).toBe(2)
      expect(state.edges).toHaveLength(1)
      expect(state.actionableNodeIds.has('n1')).toBe(true)
      expect(state.actionableNodeIds.has('n2')).toBe(false)
    })

    it('does nothing when no active board', async () => {
      await useDeepWorkBoardStore.getState().refreshNodes()
      expect(mockDb.getDeepWorkBoardById).not.toHaveBeenCalled()
    })

    it('does nothing when board not found', async () => {
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.getDeepWorkBoardById.mockResolvedValue(null)

      await useDeepWorkBoardStore.getState().refreshNodes()

      // Nodes should remain empty (unchanged)
      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(0)
    })

    it('handles errors gracefully', async () => {
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1' })
      mockDb.getDeepWorkBoardById.mockRejectedValue(new Error('DB error'))

      // Should not throw
      await useDeepWorkBoardStore.getState().refreshNodes()

      expect(useDeepWorkBoardStore.getState().nodes.size).toBe(0)
    })
  })

  // ---------- Reset ----------

  describe('reset', () => {
    it('resets all state to initial values', () => {
      // Set up some non-default state
      useDeepWorkBoardStore.setState({
        boards: [makeBoard('b1')],
        activeBoardId: 'b1',
        activeBoard: makeBoard('b1'),
        nodes: new Map([['n1', makeTaskNode('n1', makeTask('task-A'))]]),
        edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', edgeType: DeepWorkEdgeType.IntraWorkflow }],
        actionableNodeIds: new Set(['n1']),
        actionPanelOpen: false,
        expandedNodeId: 'n1',
      })

      useDeepWorkBoardStore.getState().reset()

      const state = useDeepWorkBoardStore.getState()
      expect(state.boards).toEqual([])
      expect(state.activeBoardId).toBeNull()
      expect(state.activeBoard).toBeNull()
      expect(state.nodes.size).toBe(0)
      expect(state.edges).toEqual([])
      expect(state.actionableNodeIds.size).toBe(0)
      expect(state.expandedNodeId).toBeNull()
    })

    it('clears active timers', () => {
      const timer1 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
      const timer2 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
      useDeepWorkBoardStore.setState({
        positionFlushTimer: timer1,
        viewportFlushTimer: timer2,
      })

      useDeepWorkBoardStore.getState().reset()

      const state = useDeepWorkBoardStore.getState()
      expect(state.positionFlushTimer).toBeNull()
      expect(state.viewportFlushTimer).toBeNull()
    })
  })

  // ---------- Viewport ----------

  describe('saveViewport', () => {
    it('updates local board state with viewport data', () => {
      const board = makeBoard('b1')
      useDeepWorkBoardStore.setState({ activeBoardId: 'b1', activeBoard: board })

      useDeepWorkBoardStore.getState().saveViewport(1.5, 100, 200)

      const state = useDeepWorkBoardStore.getState()
      expect(state.activeBoard?.zoom).toBe(1.5)
      expect(state.activeBoard?.panX).toBe(100)
      expect(state.activeBoard?.panY).toBe(200)
    })

    it('does nothing when no active board', () => {
      useDeepWorkBoardStore.getState().saveViewport(1.5, 100, 200)
      expect(useDeepWorkBoardStore.getState().activeBoard).toBeNull()
    })
  })
})
