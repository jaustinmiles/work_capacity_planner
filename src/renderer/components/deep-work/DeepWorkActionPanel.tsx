/**
 * DeepWorkActionPanel — Right-side collapsible panel within the canvas view.
 *
 * Two modes:
 * 1. List mode (default) — shows actionable items, active timers, completed count
 * 2. Detail mode — when a node is expanded, shows the editable detail panel
 *
 * Timer integration uses existing useTaskStore work session management.
 * A 1-second interval forces re-renders to update elapsed time display.
 */

import { useState, useEffect, useCallback } from 'react'
import { Typography, Empty, Button, Divider, Progress } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconDice } from '@arco-design/web-react/icon'
import { useDeepWorkBoardStore } from '../../store/useDeepWorkBoardStore'
import { useTaskStore } from '../../store/useTaskStore'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { getTypeEmoji } from '@shared/user-task-types'
import { formatMinutes } from '@shared/time-utils'
import type { DeepWorkNodeWithData } from '@shared/deep-work-board-types'
import type { UnifiedWorkSession } from '@shared/unified-work-session-types'
import {
  getNodeName,
  getNodeDuration,
  getNodeTypeId,
  getElapsedSeconds,
  formatElapsedStopwatch,
  findBoardSessions,
  pickRandomActionableNode,
} from '@shared/deep-work-node-utils'
import { DeepWorkNodeDetailPanel } from './DeepWorkNodeDetailPanel'
import { logger } from '@/logger'

const { Title, Text } = Typography

// =============================================================================
// Component
// =============================================================================

export function DeepWorkActionPanel() {
  const nodes = useDeepWorkBoardStore((s) => s.nodes)
  const actionableNodeIds = useDeepWorkBoardStore((s) => s.actionableNodeIds)
  const expandNode = useDeepWorkBoardStore((s) => s.expandNode)
  const expandedNodeId = useDeepWorkBoardStore((s) => s.expandedNodeId)

  const activeWorkSessions = useTaskStore((s) => s.activeWorkSessions)
  const startWork = useTaskStore((s) => s.startWork)
  const pauseWorkOnStep = useTaskStore((s) => s.pauseWorkOnStep)
  const pauseWorkOnTask = useTaskStore((s) => s.pauseWorkOnTask)
  const completeStep = useTaskStore((s) => s.completeStep)
  const updateTask = useTaskStore((s) => s.updateTask)

  const userTypes = useSortedUserTaskTypes()

  // 1-second interval for live timer updates
  const [, forceUpdate] = useState({})
  useEffect(() => {
    if (activeWorkSessions.size === 0) return
    const timer = setInterval(() => forceUpdate({}), 1000)
    return () => clearInterval(timer)
  }, [activeWorkSessions.size])

  // All useCallback hooks must be above the early return (Rules of Hooks)
  const handleStartWork = useCallback(async (node: DeepWorkNodeWithData) => {
    try {
      if (node.step) {
        await startWork({ isSimpleTask: false, stepId: node.step.id, taskId: node.step.taskId })
      } else if (node.task) {
        await startWork({ isSimpleTask: true, stepId: node.task.id, taskId: node.task.id })
      }
      logger.ui.info('Work started from board', { nodeId: node.id }, 'dwb-start-work')
    } catch (error) {
      logger.ui.error('Failed to start work', {
        error: error instanceof Error ? error.message : String(error),
      }, 'dwb-start-work-error')
    }
  }, [startWork])

  const handlePauseWork = useCallback(async (node: DeepWorkNodeWithData) => {
    try {
      if (node.step) {
        await pauseWorkOnStep(node.step.id)
      } else if (node.task) {
        await pauseWorkOnTask(node.task.id)
      }
      logger.ui.info('Work paused from board', { nodeId: node.id }, 'dwb-pause-work')
    } catch (error) {
      logger.ui.error('Failed to pause work', {
        error: error instanceof Error ? error.message : String(error),
      }, 'dwb-pause-work-error')
    }
  }, [pauseWorkOnStep, pauseWorkOnTask])

  const handleCompleteWork = useCallback(async (node: DeepWorkNodeWithData, session: UnifiedWorkSession) => {
    try {
      const elapsedMinutes = Math.ceil(getElapsedSeconds(session.startTime) / 60)

      if (node.step) {
        await completeStep(node.step.id, elapsedMinutes)
      } else if (node.task) {
        await updateTask(node.task.id, {
          completed: true,
          actualDuration: elapsedMinutes,
        })
      }
      logger.ui.info('Work completed from board', { nodeId: node.id, elapsedMinutes }, 'dwb-complete-work')
    } catch (error) {
      logger.ui.error('Failed to complete work', {
        error: error instanceof Error ? error.message : String(error),
      }, 'dwb-complete-work-error')
    }
  }, [completeStep, updateTask])

  const handleRandomize = useCallback(async () => {
    const boardSessions = findBoardSessions(nodes, activeWorkSessions)
    const activeNodeIds = new Set(boardSessions.map((s) => s.nodeId))
    const picked = pickRandomActionableNode(nodes, actionableNodeIds, activeNodeIds)
    if (!picked) return
    await handleStartWork(picked)
    logger.ui.info('Randomizer picked node', { nodeId: picked.id, name: getNodeName(picked) }, 'dwb-randomize')
  }, [nodes, actionableNodeIds, activeWorkSessions, handleStartWork])

  // If a node is expanded, show the detail panel instead
  if (expandedNodeId) {
    return (
      <div style={panelContainerStyle}>
        <DeepWorkNodeDetailPanel />
      </div>
    )
  }

  // Find active sessions that correspond to nodes on this board
  const boardSessions = findBoardSessions(nodes, activeWorkSessions)

  // Get actionable nodes (exclude ones with active sessions)
  const activeNodeIds = new Set(boardSessions.map((s) => s.nodeId))
  const actionableNodes = Array.from(actionableNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is DeepWorkNodeWithData => n !== undefined)
    .filter((n) => !activeNodeIds.has(n.id))
    .sort((a, b) => getNodeName(a).localeCompare(getNodeName(b)))

  // Count total nodes vs completed
  const totalNodes = nodes.size
  const completedNodes = Array.from(nodes.values()).filter((n) =>
    n.task?.completed || n.step?.status === 'completed' || n.step?.status === 'skipped',
  ).length

  return (
    <div style={panelContainerStyle}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb' }}>
        <Title heading={6} style={{ margin: 0, marginBottom: 4 }}>
          Actions
        </Title>
        <Text style={{ fontSize: 12, color: '#86909c' }}>
          {completedNodes}/{totalNodes} completed
        </Text>
        {totalNodes > 0 && (
          <Progress
            percent={totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0}
            size="small"
            style={{ marginTop: 4 }}
          />
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>

        {/* Active Timers (always at top when present) */}
        {boardSessions.length > 0 && (
          <>
            <div style={{ padding: '0 16px', marginBottom: 8 }}>
              <Text style={sectionHeaderStyle}>
                Active ({boardSessions.length})
              </Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {boardSessions.map(({ nodeId, node, session }) => {
                const elapsed = getElapsedSeconds(session.startTime)
                const planned = getNodeDuration(node)
                const elapsedMinutes = Math.floor(elapsed / 60)
                const progress = planned > 0 ? Math.min(Math.round((elapsedMinutes / planned) * 100), 100) : 0

                return (
                  <div
                    key={nodeId}
                    style={{
                      padding: '10px 16px',
                      background: '#f0fff0',
                      borderBottom: '1px solid #e5e6eb',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                          {getNodeName(node)}
                        </Text>
                      </div>
                      <Text style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#00b42a' }}>
                        {formatElapsedStopwatch(elapsed)}
                      </Text>
                    </div>

                    {/* Progress bar: elapsed vs planned */}
                    {planned > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <Progress
                          percent={progress}
                          size="small"
                          color={progress >= 100 ? '#ff7d00' : '#00b42a'}
                        />
                        <Text style={{ fontSize: 11, color: '#86909c' }}>
                          {formatMinutes(elapsedMinutes)} / {formatMinutes(planned)} planned
                        </Text>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="mini"
                        icon={<IconPause />}
                        onClick={() => handlePauseWork(node)}
                      >
                        Pause
                      </Button>
                      <Button
                        size="mini"
                        type="primary"
                        status="success"
                        icon={<IconCheck />}
                        onClick={() => handleCompleteWork(node, session)}
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Divider style={{ margin: '8px 0' }} />
          </>
        )}

        {/* Actionable Items */}
        <div style={{ padding: '0 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={sectionHeaderStyle}>
            Ready to Start ({actionableNodes.length})
          </Text>
          {actionableNodes.length > 0 && (
            <Button
              size="mini"
              type="outline"
              icon={<IconDice />}
              onClick={handleRandomize}
              title="Start a random task"
            >
              Randomize
            </Button>
          )}
        </div>

        {actionableNodes.length === 0 ? (
          <div style={{ padding: '16px' }}>
            <Empty description="No actionable items" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actionableNodes.map((node) => {
              const typeId = getNodeTypeId(node)
              const typeEmoji = getTypeEmoji(userTypes, typeId)
              const duration = getNodeDuration(node)

              return (
                <div
                  key={node.id}
                  onClick={() => expandNode(node.id)}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: '1px solid #f2f3f5',
                  }}
                >
                  {typeEmoji && (
                    <span style={{ fontSize: 14 }}>{typeEmoji}</span>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {getNodeName(node)}
                    </Text>
                    {duration > 0 && (
                      <Text style={{ fontSize: 11, color: '#86909c' }}>
                        {formatMinutes(duration)}
                      </Text>
                    )}
                  </div>

                  <Button
                    size="mini"
                    type="primary"
                    icon={<IconPlayArrow />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartWork(node)
                    }}
                    title="Start work"
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

const panelContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  borderLeft: '1px solid #e5e6eb',
  overflow: 'hidden',
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#4e5969',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

