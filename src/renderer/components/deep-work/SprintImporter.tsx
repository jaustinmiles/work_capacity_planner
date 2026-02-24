/**
 * SprintImporter — Modal dialog for selectively importing sprint tasks
 * onto the Deep Work Board.
 *
 * Shows tasks/workflows with inActiveSprint=true that aren't already
 * on the current board. The user selects which items to import, and
 * they're placed in a grid to the right of existing nodes.
 */

import { useState, useMemo, useCallback } from 'react'
import { Modal, Checkbox, Button, Empty, Typography, Space, Tag } from '@arco-design/web-react'
import { useTaskStore } from '../../store/useTaskStore'
import { useDeepWorkBoardStore } from '../../store/useDeepWorkBoardStore'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { getTypeEmoji, getTypeName } from '@shared/user-task-types'
import { formatMinutes } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { logger } from '@/logger'
import type { DeepWorkNodeWithData } from '@shared/deep-work-board-types'

const { Text } = Typography

// =============================================================================
// Types
// =============================================================================

interface ImportCandidate {
  id: string
  name: string
  typeId: string
  duration: number
  /** The task ID — for standalone tasks this is the task itself, for steps it's the parent */
  taskId: string
  /** If this candidate is a step, the step ID */
  stepId?: string
  /** Parent workflow name (only for steps) */
  workflowName?: string
}

interface SprintImporterProps {
  visible: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function SprintImporter({ visible, onClose }: SprintImporterProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const sequencedTasks = useTaskStore((s) => s.sequencedTasks)
  const nodes = useDeepWorkBoardStore((s) => s.nodes)
  const activeBoardId = useDeepWorkBoardStore((s) => s.activeBoardId)
  const userTypes = useSortedUserTaskTypes()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  // Build sets of task/step IDs already on the board
  const existingTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [, node] of nodes) {
      if (node.taskId) ids.add(node.taskId)
    }
    return ids
  }, [nodes])

  const existingStepIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [, node] of nodes) {
      if (node.stepId) ids.add(node.stepId)
    }
    return ids
  }, [nodes])

  // Build import candidates from sprint tasks
  const candidates: ImportCandidate[] = useMemo(() => {
    const result: ImportCandidate[] = []

    // Standalone tasks (inActiveSprint, not archived, not completed, not already on board)
    for (const task of tasks) {
      if (!task.inActiveSprint || task.archived || task.completed) continue
      if (task.hasSteps) continue // Handled via sequencedTasks below
      if (existingTaskIds.has(task.id)) continue

      result.push({
        id: task.id,
        name: task.name,
        typeId: task.type ?? '',
        duration: task.duration,
        taskId: task.id,
      })
    }

    // Workflow steps (from sequencedTasks which have inActiveSprint tasks)
    for (const wf of sequencedTasks) {
      if (!wf.inActiveSprint || wf.archived) continue
      if (!wf.steps || wf.steps.length === 0) continue

      for (const step of wf.steps) {
        if (step.status === 'completed' || step.status === 'skipped') continue
        if (existingStepIds.has(step.id)) continue

        result.push({
          id: step.id,
          name: step.name,
          typeId: step.type,
          duration: step.duration,
          taskId: wf.id,
          stepId: step.id,
          workflowName: wf.name,
        })
      }
    }

    return result
  }, [tasks, sequencedTasks, existingTaskIds, existingStepIds])

  const handleToggle = useCallback((candidateId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) {
        next.delete(candidateId)
      } else {
        next.add(candidateId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)))
    }
  }, [selectedIds.size, candidates])

  const handleImport = useCallback(async () => {
    if (!activeBoardId || selectedIds.size === 0) return

    setImporting(true)
    try {
      const db = getDatabase()

      // Calculate positions: grid to the right of existing nodes
      const existingNodeArray = Array.from(nodes.values())
      const maxX = existingNodeArray.length > 0
        ? Math.max(...existingNodeArray.map((n) => n.positionX)) + 300
        : 100
      const startY = 100
      const spacingX = 280
      const spacingY = 150
      const nodesPerRow = 4

      const selected = candidates.filter((c) => selectedIds.has(c.id))
      const newNodes: DeepWorkNodeWithData[] = []

      for (let i = 0; i < selected.length; i++) {
        const candidate = selected[i]!
        const col = i % nodesPerRow
        const row = Math.floor(i / nodesPerRow)

        const node = await db.addDeepWorkNode({
          boardId: activeBoardId,
          taskId: candidate.stepId ? undefined : candidate.taskId,
          stepId: candidate.stepId,
          positionX: maxX + col * spacingX,
          positionY: startY + row * spacingY,
        })
        newNodes.push(node)
      }

      // Update the board store with new nodes
      useDeepWorkBoardStore.setState((state) => {
        const updatedNodes = new Map(state.nodes)
        for (const node of newNodes) {
          updatedNodes.set(node.id, node)
        }
        return { nodes: updatedNodes }
      })

      // Recompute derived state
      useDeepWorkBoardStore.getState().recomputeEdges()

      logger.ui.info('Sprint import complete', {
        count: newNodes.length,
        boardId: activeBoardId,
      }, 'dwb-sprint-import')

      setSelectedIds(new Set())
      onClose()
    } catch (error) {
      logger.ui.error('Sprint import failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'dwb-sprint-import-error')
    } finally {
      setImporting(false)
    }
  }, [activeBoardId, selectedIds, candidates, nodes, onClose])

  // Reset selection when dialog opens
  const handleAfterOpen = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return (
    <Modal
      title="Import from Sprint"
      visible={visible}
      onCancel={onClose}
      afterOpen={handleAfterOpen}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={importing}
            disabled={selectedIds.size === 0}
            onClick={handleImport}
          >
            Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </Space>
      }
      style={{ maxWidth: 560 }}
      unmountOnExit
    >
      {candidates.length === 0 ? (
        <Empty description="All sprint items are already on this board" />
      ) : (
        <>
          {/* Select all toggle */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Checkbox
              checked={selectedIds.size === candidates.length}
              indeterminate={selectedIds.size > 0 && selectedIds.size < candidates.length}
              onChange={handleSelectAll}
            >
              Select All ({candidates.length})
            </Checkbox>
          </div>

          {/* Candidate list */}
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {candidates.map((candidate) => {
              const emoji = getTypeEmoji(userTypes, candidate.typeId)
              const typeName = getTypeName(userTypes, candidate.typeId)

              return (
                <div
                  key={candidate.id}
                  onClick={() => handleToggle(candidate.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid #f2f3f5',
                    cursor: 'pointer',
                    background: selectedIds.has(candidate.id) ? '#f0f5ff' : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  <Checkbox checked={selectedIds.has(candidate.id)} />

                  {emoji && <span style={{ fontSize: 14 }}>{emoji}</span>}

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
                      {candidate.name}
                    </Text>
                    {candidate.workflowName && (
                      <Text style={{ fontSize: 11, color: '#86909c' }}>
                        {candidate.workflowName}
                      </Text>
                    )}
                  </div>

                  <Space size="mini">
                    {typeName && (
                      <Tag size="small" color="arcoblue">{typeName}</Tag>
                    )}
                    {candidate.duration > 0 && (
                      <Text style={{ fontSize: 11, color: '#86909c', whiteSpace: 'nowrap' }}>
                        {formatMinutes(candidate.duration)}
                      </Text>
                    )}
                  </Space>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
