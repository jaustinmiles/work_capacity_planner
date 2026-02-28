/**
 * Deep Work Board Store
 *
 * Manages the state of the Deep Work Board — a freeform whiteboard canvas
 * for creating, connecting, and executing tasks. Follows the same Zustand
 * patterns as useEndeavorStore and useTaskStore.
 *
 * Key design: DeepWorkNodes are "projections" of Task/TaskStep entities.
 * This store manages canvas state (positions, viewport) and delegates
 * task mutations to existing tRPC endpoints.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'
import type {
  DeepWorkBoard,
  DeepWorkNodeWithData,
  DeepWorkEdge,
  DeepWorkCluster,
} from '@shared/deep-work-board-types'
import { DeepWorkEdgeType } from '@shared/deep-work-board-types'
import { StepStatus } from '@shared/enums'

// =============================================================================
// Types
// =============================================================================

export enum BoardLoadStatus {
  Idle = 'idle',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

interface DeepWorkBoardState {
  // Board management
  boards: DeepWorkBoard[]
  activeBoardId: string | null
  activeBoard: DeepWorkBoard | null
  status: BoardLoadStatus
  error: string | null

  // Canvas state
  nodes: Map<string, DeepWorkNodeWithData>
  edges: DeepWorkEdge[]

  // Derived state (computed from edges)
  clusters: DeepWorkCluster[]
  actionableNodeIds: Set<string>

  // Action panel
  actionPanelOpen: boolean
  actionPanelFilter: string | null // cluster ID or null for "all"

  // Node detail panel
  expandedNodeId: string | null

  // Debounce tracking (not persisted)
  pendingPositionUpdates: Map<string, { positionX: number; positionY: number }>
  positionFlushTimer: ReturnType<typeof setTimeout> | null
  viewportFlushTimer: ReturnType<typeof setTimeout> | null
}

interface DeepWorkBoardActions {
  // Board lifecycle
  loadBoards: () => Promise<void>
  createBoard: (name: string) => Promise<string>
  switchBoard: (boardId: string) => Promise<void>
  deleteBoard: (boardId: string) => Promise<void>
  updateBoardName: (name: string) => Promise<void>

  // Node operations
  addNode: (position: { x: number; y: number }, name: string) => Promise<DeepWorkNodeWithData>
  moveNode: (nodeId: string, position: { x: number; y: number }) => void
  moveNodes: (updates: Array<{ nodeId: string; position: { x: number; y: number } }>) => void
  flushPositionUpdates: () => Promise<void>
  removeNode: (nodeId: string) => Promise<void>

  // Viewport
  saveViewport: (zoom: number, panX: number, panY: number) => void

  // Action panel
  toggleActionPanel: () => void
  setActionPanelFilter: (clusterId: string | null) => void

  // Node detail panel
  expandNode: (nodeId: string) => void
  collapseNodePanel: () => void

  // Edge operations (connect/disconnect with morphing)
  connectNodes: (sourceNodeId: string, targetNodeId: string) => Promise<void>
  disconnectNodes: (sourceNodeId: string, targetNodeId: string) => Promise<void>

  // Import
  importFromSprint: () => Promise<number>

  // Derived state recomputation
  recomputeEdges: () => void
  recomputeActionable: () => void

  // Refresh nodes from server (called when external task changes detected)
  refreshNodes: () => Promise<void>

  // Reset
  reset: () => void
}

type DeepWorkBoardStore = DeepWorkBoardState & DeepWorkBoardActions

// =============================================================================
// Constants
// =============================================================================

const POSITION_FLUSH_DELAY_MS = 500
const VIEWPORT_FLUSH_DELAY_MS = 500

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive edges from the nodes on the board by reading their dependsOn arrays.
 * For step nodes: edges come from TaskStep.dependsOn (intra-workflow)
 * For task nodes with dependencies: edges come from Task.dependencies
 */
export function deriveEdgesFromNodes(nodes: Map<string, DeepWorkNodeWithData>): DeepWorkEdge[] {
  const edges: DeepWorkEdge[] = []
  const nodeArray = Array.from(nodes.values())

  // Build lookup maps: stepId -> nodeId, taskId -> nodeId
  const stepIdToNodeId = new Map<string, string>()
  const taskIdToNodeId = new Map<string, string>()

  for (const node of nodeArray) {
    if (node.stepId && node.step) {
      stepIdToNodeId.set(node.stepId, node.id)
    }
    if (node.taskId && node.task) {
      taskIdToNodeId.set(node.taskId, node.id)
    }
  }

  // Derive edges from step dependencies
  for (const node of nodeArray) {
    if (node.step && node.step.dependsOn.length > 0) {
      for (const depStepId of node.step.dependsOn) {
        const sourceNodeId = stepIdToNodeId.get(depStepId)
        if (sourceNodeId) {
          // Check if same workflow (intra) or different (cross)
          const sourceNode = nodes.get(sourceNodeId)
          const sameWorkflow = sourceNode?.step?.taskId === node.step.taskId
          edges.push({
            id: `edge-${sourceNodeId}-${node.id}`,
            sourceNodeId,
            targetNodeId: node.id,
            edgeType: sameWorkflow ? DeepWorkEdgeType.IntraWorkflow : DeepWorkEdgeType.CrossWorkflow,
          })
        }
      }
    }

    // Derive edges from task dependencies (standalone tasks with explicit deps)
    if (node.task && !node.task.hasSteps) {
      const deps: string[] = node.task.dependencies ?? []
      for (const depTaskId of deps) {
        const sourceNodeId = taskIdToNodeId.get(depTaskId)
        if (sourceNodeId) {
          edges.push({
            id: `edge-${sourceNodeId}-${node.id}`,
            sourceNodeId,
            targetNodeId: node.id,
            edgeType: DeepWorkEdgeType.IntraWorkflow,
          })
        }
      }
    }
  }

  return edges
}

/**
 * Compute which nodes are "actionable" — all dependencies satisfied, not completed.
 */
export function computeActionableNodeIds(
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
): Set<string> {
  const actionable = new Set<string>()

  // Build set of completed node IDs
  const completedNodeIds = new Set<string>()
  for (const [nodeId, node] of nodes) {
    if (node.task && node.task.completed) {
      completedNodeIds.add(nodeId)
    }
    if (node.step && (node.step.status === StepStatus.Completed || node.step.status === StepStatus.Skipped)) {
      completedNodeIds.add(nodeId)
    }
  }

  // Build map of node -> its dependency source node IDs
  const nodeDependencies = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!nodeDependencies.has(edge.targetNodeId)) {
      nodeDependencies.set(edge.targetNodeId, new Set())
    }
    nodeDependencies.get(edge.targetNodeId)!.add(edge.sourceNodeId)
  }

  // A node is actionable if:
  // 1. Not completed itself
  // 2. All dependencies (source nodes) are completed
  for (const [nodeId] of nodes) {
    if (completedNodeIds.has(nodeId)) continue

    const deps = nodeDependencies.get(nodeId)
    if (!deps || deps.size === 0) {
      // No dependencies — actionable
      actionable.add(nodeId)
    } else {
      // All dependencies must be completed
      const allDepsComplete = Array.from(deps).every((depId) => completedNodeIds.has(depId))
      if (allDepsComplete) {
        actionable.add(nodeId)
      }
    }
  }

  return actionable
}

// =============================================================================
// Store
// =============================================================================

const initialState: DeepWorkBoardState = {
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
}

export const useDeepWorkBoardStore = create<DeepWorkBoardStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================================================
    // Board Lifecycle
    // ========================================================================

    loadBoards: async () => {
      set({ status: BoardLoadStatus.Loading, error: null })
      try {
        const db = getDatabase()
        const boards = await db.getDeepWorkBoards()
        set({ boards, status: BoardLoadStatus.Loaded })
        logger.ui.info('Deep work boards loaded', { count: boards.length }, 'dwb-load')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load boards'
        set({ status: BoardLoadStatus.Error, error: message })
        logger.ui.error('Failed to load boards', { error: message }, 'dwb-load-error')
      }
    },

    createBoard: async (name: string): Promise<string> => {
      const db = getDatabase()
      const board = await db.createDeepWorkBoard({ name })
      set((state) => ({
        boards: [...state.boards, board],
        activeBoardId: board.id,
        activeBoard: board,
        actionPanelOpen: board.actionPanelOpen,
        nodes: new Map(),
        edges: [],
        clusters: [],
        actionableNodeIds: new Set(),
      }))
      logger.ui.info('Board created', { boardId: board.id, name }, 'dwb-create')
      return board.id
    },

    switchBoard: async (boardId: string) => {
      // Flush any pending position updates from the previous board
      await get().flushPositionUpdates()

      // NOTE: We intentionally do NOT set status=Loading here.
      // Setting Loading would cause DeepWorkBoardView to unmount the canvas,
      // which destroys ReactFlow's container measurement and causes blank renders.
      // The board list is already loaded — switching boards only fetches node data.
      try {
        const db = getDatabase()
        const result = await db.getDeepWorkBoardById(boardId)
        if (!result) {
          set({ status: BoardLoadStatus.Error, error: 'Board not found' })
          return
        }

        const nodeMap = new Map<string, DeepWorkNodeWithData>()
        for (const node of result.nodes) {
          nodeMap.set(node.id, node)
        }

        const edges = deriveEdgesFromNodes(nodeMap)
        const actionableNodeIds = computeActionableNodeIds(nodeMap, edges)

        set({
          activeBoardId: boardId,
          activeBoard: result.board,
          nodes: nodeMap,
          edges,
          actionableNodeIds,
          actionPanelOpen: result.board.actionPanelOpen,
          expandedNodeId: null,
          actionPanelFilter: null,
          status: BoardLoadStatus.Loaded,
        })
        logger.ui.info('Board switched', { boardId, nodeCount: result.nodes.length }, 'dwb-switch')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load board'
        set({ status: BoardLoadStatus.Error, error: message })
        logger.ui.error('Failed to switch board', { error: message, boardId }, 'dwb-switch-error')
      }
    },

    deleteBoard: async (boardId: string) => {
      const db = getDatabase()
      await db.deleteDeepWorkBoard(boardId)
      set((state) => {
        const boards = state.boards.filter((b) => b.id !== boardId)
        const wasActive = state.activeBoardId === boardId
        return {
          boards,
          ...(wasActive ? {
            activeBoardId: null,
            activeBoard: null,
            nodes: new Map(),
            edges: [],
            clusters: [],
            actionableNodeIds: new Set(),
            expandedNodeId: null,
          } : {}),
        }
      })
      logger.ui.info('Board deleted', { boardId }, 'dwb-delete')
    },

    updateBoardName: async (name: string) => {
      const { activeBoardId } = get()
      if (!activeBoardId) return
      const db = getDatabase()
      const updated = await db.updateDeepWorkBoard({ id: activeBoardId, name })
      set((state) => ({
        activeBoard: updated,
        boards: state.boards.map((b) => (b.id === activeBoardId ? updated : b)),
      }))
    },

    // ========================================================================
    // Node Operations
    // ========================================================================

    addNode: async (position: { x: number; y: number }, name: string): Promise<DeepWorkNodeWithData> => {
      const { activeBoardId } = get()
      if (!activeBoardId) {
        throw new Error('No active board')
      }

      const db = getDatabase()
      const node = await db.createDeepWorkTaskAndNode({
        boardId: activeBoardId,
        name,
        positionX: position.x,
        positionY: position.y,
      })

      set((state) => {
        const newNodes = new Map(state.nodes)
        newNodes.set(node.id, node)
        const edges = deriveEdgesFromNodes(newNodes)
        const actionableNodeIds = computeActionableNodeIds(newNodes, edges)
        return { nodes: newNodes, edges, actionableNodeIds }
      })

      logger.ui.info('Node created', { nodeId: node.id, name }, 'dwb-node-create')
      return node
    },

    moveNode: (nodeId: string, position: { x: number; y: number }) => {
      // Optimistic local update
      set((state) => {
        const node = state.nodes.get(nodeId)
        if (!node) return state

        const newNodes = new Map(state.nodes)
        newNodes.set(nodeId, { ...node, positionX: position.x, positionY: position.y })

        // Track pending update for debounced flush
        const pending = new Map(state.pendingPositionUpdates)
        pending.set(nodeId, { positionX: position.x, positionY: position.y })

        // Clear existing timer
        if (state.positionFlushTimer) {
          clearTimeout(state.positionFlushTimer)
        }

        // Set new debounced flush
        const timer = setTimeout(() => {
          get().flushPositionUpdates()
        }, POSITION_FLUSH_DELAY_MS)

        return { nodes: newNodes, pendingPositionUpdates: pending, positionFlushTimer: timer }
      })
    },

    moveNodes: (updates: Array<{ nodeId: string; position: { x: number; y: number } }>) => {
      set((state) => {
        const newNodes = new Map(state.nodes)
        const pending = new Map(state.pendingPositionUpdates)

        for (const { nodeId, position } of updates) {
          const node = newNodes.get(nodeId)
          if (node) {
            newNodes.set(nodeId, { ...node, positionX: position.x, positionY: position.y })
            pending.set(nodeId, { positionX: position.x, positionY: position.y })
          }
        }

        if (state.positionFlushTimer) {
          clearTimeout(state.positionFlushTimer)
        }

        const timer = setTimeout(() => {
          get().flushPositionUpdates()
        }, POSITION_FLUSH_DELAY_MS)

        return { nodes: newNodes, pendingPositionUpdates: pending, positionFlushTimer: timer }
      })
    },

    flushPositionUpdates: async () => {
      const { pendingPositionUpdates, positionFlushTimer } = get()
      if (pendingPositionUpdates.size === 0) return

      if (positionFlushTimer) {
        clearTimeout(positionFlushTimer)
      }

      const updates = Array.from(pendingPositionUpdates.entries()).map(([nodeId, pos]) => ({
        nodeId,
        positionX: pos.positionX,
        positionY: pos.positionY,
      }))

      set({ pendingPositionUpdates: new Map(), positionFlushTimer: null })

      try {
        const db = getDatabase()
        await db.updateDeepWorkNodePositions({ updates })
      } catch (error) {
        logger.ui.error('Failed to flush node positions', {
          error: error instanceof Error ? error.message : String(error),
          count: updates.length,
        }, 'dwb-position-flush-error')
      }
    },

    removeNode: async (nodeId: string) => {
      const db = getDatabase()
      await db.removeDeepWorkNode(nodeId)

      set((state) => {
        const newNodes = new Map(state.nodes)
        newNodes.delete(nodeId)
        const edges = deriveEdgesFromNodes(newNodes)
        const actionableNodeIds = computeActionableNodeIds(newNodes, edges)
        return {
          nodes: newNodes,
          edges,
          actionableNodeIds,
          expandedNodeId: state.expandedNodeId === nodeId ? null : state.expandedNodeId,
        }
      })
      logger.ui.info('Node removed', { nodeId }, 'dwb-node-remove')
    },

    // ========================================================================
    // Viewport
    // ========================================================================

    saveViewport: (zoom: number, panX: number, panY: number) => {
      const { activeBoardId, viewportFlushTimer } = get()
      if (!activeBoardId) return

      if (viewportFlushTimer) {
        clearTimeout(viewportFlushTimer)
      }

      const timer = setTimeout(async () => {
        try {
          const db = getDatabase()
          await db.saveDeepWorkViewport({ boardId: activeBoardId, zoom, panX, panY })
        } catch (error) {
          logger.ui.error('Failed to save viewport', {
            error: error instanceof Error ? error.message : String(error),
          }, 'dwb-viewport-error')
        }
      }, VIEWPORT_FLUSH_DELAY_MS)

      set((state) => ({
        viewportFlushTimer: timer,
        activeBoard: state.activeBoard ? { ...state.activeBoard, zoom, panX, panY } : null,
      }))
    },

    // ========================================================================
    // Action Panel
    // ========================================================================

    toggleActionPanel: () => {
      set((state) => {
        const newOpen = !state.actionPanelOpen
        // Persist to DB (fire and forget)
        if (state.activeBoardId) {
          const db = getDatabase()
          db.updateDeepWorkBoard({ id: state.activeBoardId, actionPanelOpen: newOpen })
            .catch((err) => logger.ui.error('Failed to persist panel state', { error: String(err) }, 'dwb-panel-error'))
        }
        return { actionPanelOpen: newOpen }
      })
    },

    setActionPanelFilter: (clusterId: string | null) => {
      set({ actionPanelFilter: clusterId })
    },

    // ========================================================================
    // Node Detail Panel
    // ========================================================================

    expandNode: (nodeId: string) => {
      set({ expandedNodeId: nodeId })
    },

    collapseNodePanel: () => {
      set({ expandedNodeId: null })
    },

    // ========================================================================
    // Edge Operations (Connect / Disconnect with Morphing)
    // ========================================================================

    connectNodes: async (sourceNodeId: string, targetNodeId: string) => {
      const { activeBoardId } = get()
      if (!activeBoardId) return

      const db = getDatabase()
      const result = await db.createDeepWorkEdge({
        boardId: activeBoardId,
        sourceNodeId,
        targetNodeId,
      })

      // Replace all nodes with the updated hydrated data from the server
      const nodeMap = new Map<string, DeepWorkNodeWithData>()
      for (const node of result.nodes) {
        nodeMap.set(node.id, node)
      }
      const edges = deriveEdgesFromNodes(nodeMap)
      const actionableNodeIds = computeActionableNodeIds(nodeMap, edges)
      set({ nodes: nodeMap, edges, actionableNodeIds })

      logger.ui.info('Nodes connected', { sourceNodeId, targetNodeId }, 'dwb-connect')
    },

    disconnectNodes: async (sourceNodeId: string, targetNodeId: string) => {
      const { activeBoardId } = get()
      if (!activeBoardId) return

      const db = getDatabase()
      const result = await db.removeDeepWorkEdge({
        boardId: activeBoardId,
        sourceNodeId,
        targetNodeId,
      })

      // Replace all nodes with the updated hydrated data from the server
      const nodeMap = new Map<string, DeepWorkNodeWithData>()
      for (const node of result.nodes) {
        nodeMap.set(node.id, node)
      }
      const edges = deriveEdgesFromNodes(nodeMap)
      const actionableNodeIds = computeActionableNodeIds(nodeMap, edges)
      set({ nodes: nodeMap, edges, actionableNodeIds })

      logger.ui.info('Nodes disconnected', { sourceNodeId, targetNodeId }, 'dwb-disconnect')
    },

    // ========================================================================
    // Import
    // ========================================================================

    importFromSprint: async (): Promise<number> => {
      const { activeBoardId } = get()
      if (!activeBoardId) return 0

      const db = getDatabase()
      const newNodes = await db.importDeepWorkFromSprint({ boardId: activeBoardId })

      set((state) => {
        const updatedNodes = new Map(state.nodes)
        for (const node of newNodes) {
          updatedNodes.set(node.id, node)
        }
        const edges = deriveEdgesFromNodes(updatedNodes)
        const actionableNodeIds = computeActionableNodeIds(updatedNodes, edges)
        return { nodes: updatedNodes, edges, actionableNodeIds }
      })

      logger.ui.info('Sprint import complete', { count: newNodes.length }, 'dwb-import')
      return newNodes.length
    },

    // ========================================================================
    // Derived State Recomputation
    // ========================================================================

    recomputeEdges: () => {
      set((state) => {
        const edges = deriveEdgesFromNodes(state.nodes)
        const actionableNodeIds = computeActionableNodeIds(state.nodes, edges)
        return { edges, actionableNodeIds }
      })
    },

    recomputeActionable: () => {
      set((state) => {
        const actionableNodeIds = computeActionableNodeIds(state.nodes, state.edges)
        return { actionableNodeIds }
      })
    },

    // ========================================================================
    // Refresh Nodes (re-fetch from server to pick up external task changes)
    // ========================================================================

    refreshNodes: async () => {
      const { activeBoardId } = get()
      if (!activeBoardId) return

      try {
        const db = getDatabase()
        const result = await db.getDeepWorkBoardById(activeBoardId)
        if (!result) return

        const nodeMap = new Map<string, DeepWorkNodeWithData>()
        for (const node of result.nodes) {
          nodeMap.set(node.id, node)
        }

        const edges = deriveEdgesFromNodes(nodeMap)
        const actionableNodeIds = computeActionableNodeIds(nodeMap, edges)

        set({ nodes: nodeMap, edges, actionableNodeIds })
      } catch (error) {
        logger.ui.error('Failed to refresh nodes', {
          error: error instanceof Error ? error.message : String(error),
        }, 'dwb-refresh-error')
      }
    },

    // ========================================================================
    // Reset
    // ========================================================================

    reset: () => {
      const { positionFlushTimer, viewportFlushTimer } = get()
      if (positionFlushTimer) clearTimeout(positionFlushTimer)
      if (viewportFlushTimer) clearTimeout(viewportFlushTimer)
      set(initialState)
    },
  })),
)
