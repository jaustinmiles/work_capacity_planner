/**
 * DeepWorkBoardView — Top-level view container for the Deep Work Board.
 *
 * This is the main entry point registered in App.tsx under ViewType.DeepWork.
 * Layout: Toolbar (top) + Canvas (center) + Action Panel (right, collapsible)
 *
 * Handles:
 * - Board initialization (auto-create if none exists)
 * - Keyboard shortcuts (Escape to close panel)
 * - Layout coordination between canvas and action panel
 * - Responsive panel auto-collapse below 1024px width
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { Spin, Empty, Button } from '@arco-design/web-react'
import { IconPlus } from '@arco-design/web-react/icon'
import { useDeepWorkBoardStore, BoardLoadStatus } from '../../store/useDeepWorkBoardStore'
import { DeepWorkCanvas } from './DeepWorkCanvas'
import { DeepWorkToolbar } from './DeepWorkToolbar'
import { DeepWorkActionPanel } from './DeepWorkActionPanel'
import { logger } from '@/logger'

// Width threshold below which the action panel auto-collapses
const RESPONSIVE_COLLAPSE_WIDTH = 1024

// =============================================================================
// Component
// =============================================================================

export function DeepWorkBoardView() {
  const boards = useDeepWorkBoardStore((s) => s.boards)
  const activeBoardId = useDeepWorkBoardStore((s) => s.activeBoardId)
  const status = useDeepWorkBoardStore((s) => s.status)
  const actionPanelOpen = useDeepWorkBoardStore((s) => s.actionPanelOpen)
  const loadBoards = useDeepWorkBoardStore((s) => s.loadBoards)
  const createBoard = useDeepWorkBoardStore((s) => s.createBoard)
  const switchBoard = useDeepWorkBoardStore((s) => s.switchBoard)
  const collapseNodePanel = useDeepWorkBoardStore((s) => s.collapseNodePanel)
  const expandedNodeId = useDeepWorkBoardStore((s) => s.expandedNodeId)

  const containerRef = useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  // Load boards on mount
  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  // Auto-switch to first board when boards load
  useEffect(() => {
    const firstBoard = boards[0]
    if (status === BoardLoadStatus.Loaded && firstBoard && !activeBoardId) {
      switchBoard(firstBoard.id)
    }
  }, [status, boards, activeBoardId, switchBoard])

  // Responsive: auto-collapse action panel below threshold
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setIsNarrow(entry.contentRect.width < RESPONSIVE_COLLAPSE_WIDTH)
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture events from input elements
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Escape: close node detail panel
      if (e.key === 'Escape' && expandedNodeId) {
        e.preventDefault()
        collapseNodePanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedNodeId, collapseNodePanel])

  // Handle connection — triggers morph logic (Task↔Step conversion)
  const connectNodes = useDeepWorkBoardStore((s) => s.connectNodes)
  const handleConnect = useCallback((sourceNodeId: string, targetNodeId: string) => {
    connectNodes(sourceNodeId, targetNodeId).catch((err) => {
      logger.ui.error('Edge connection failed', { sourceNodeId, targetNodeId, error: String(err) }, 'dwb-connect-error')
    })
  }, [connectNodes])

  // Handle disconnection — triggers un-morph logic (Step→Task reversion)
  const disconnectNodes = useDeepWorkBoardStore((s) => s.disconnectNodes)
  const handleDisconnect = useCallback((sourceNodeId: string, targetNodeId: string) => {
    disconnectNodes(sourceNodeId, targetNodeId).catch((err) => {
      logger.ui.error('Edge disconnection failed', { sourceNodeId, targetNodeId, error: String(err) }, 'dwb-disconnect-error')
    })
  }, [disconnectNodes])

  // Create first board
  const handleCreateFirstBoard = useCallback(async () => {
    const id = await createBoard('Deep Work Board')
    await switchBoard(id)
  }, [createBoard, switchBoard])

  // Show panel only when open and not in narrow mode
  const showPanel = actionPanelOpen && !isNarrow

  // Determine if we should show empty state (no boards after loading completes)
  const showEmptyState = status === BoardLoadStatus.Loaded && boards.length === 0

  // Determine if we're in initial loading (no board data yet)
  const isInitialLoading = status === BoardLoadStatus.Loading && !activeBoardId && boards.length === 0

  logger.ui.info('DeepWorkBoardView render', {
    status,
    boardCount: boards.length,
    activeBoardId,
    showPanel,
    showEmptyState,
    isInitialLoading,
  }, 'dwb-view-render')

  // No boards — show empty state (canvas never mounted yet, safe to early-return)
  if (showEmptyState) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        gap: 16,
      }}>
        <Empty
          description="No boards yet"
          style={{ marginBottom: 8 }}
        />
        <Button
          type="primary"
          icon={<IconPlus />}
          onClick={handleCreateFirstBoard}
        >
          Create Your First Board
        </Button>
        <span style={{ fontSize: 13, color: '#86909c', maxWidth: 400, textAlign: 'center' }}>
          Double-click anywhere on the canvas to create tasks.
          Drag from handles to connect dependencies.
        </span>
      </div>
    )
  }

  // CRITICAL: Always render the canvas layout — never unmount it during loading.
  // ReactFlow needs a stable, mounted container to measure dimensions correctly.
  // Loading/switching states are shown as overlays so the canvas stays mounted.
  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <DeepWorkToolbar />

      {/* Canvas + Action Panel */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Main canvas area — minHeight: 0 is critical for flexbox to allow ReactFlow to measure */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <DeepWorkCanvas onConnect={handleConnect} onDisconnect={handleDisconnect} />

          {/* Loading overlay — shown OVER the canvas, not INSTEAD of it */}
          {isInitialLoading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.8)',
              zIndex: 10,
            }}>
              <Spin size={32} />
            </div>
          )}
        </div>

        {/* Action panel (collapsible right side) */}
        {showPanel && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <DeepWorkActionPanel />
          </div>
        )}
      </div>
    </div>
  )
}
