/**
 * DeepWorkNodeDetailPanel — Editable detail panel for a selected node.
 *
 * Appears in the right-side action panel when a node is double-clicked.
 * Supports editing both standalone tasks and workflow steps.
 * Delegates updates to useTaskStore for full reactive integration.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Input,
  InputNumber,
  Select,
  Slider,
  Typography,
  Button,
  Space,
  Divider,
  DatePicker,
  Tag,
} from '@arco-design/web-react'
import {
  IconClose,
  IconCheck,
  IconClockCircle,
  IconStar,
  IconFire,
  IconEdit,
} from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { DeepWorkNodeStatus } from '@shared/deep-work-board-types'
import { DeadlineType } from '@shared/enums'
import type { Task, TaskStep } from '@shared/types'
import { formatMinutes } from '@shared/time-utils'
import {
  deriveDeepWorkDisplayStatus,
  getInitialFields,
  STATUS_LABELS,
  type EditableFields,
} from '@shared/deep-work-node-utils'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { useTaskStore } from '../../store/useTaskStore'
import { useDeepWorkBoardStore } from '../../store/useDeepWorkBoardStore'
import { logger } from '@/logger'

const { Text } = Typography
const { TextArea } = Input

// =============================================================================
// Component
// =============================================================================

export function DeepWorkNodeDetailPanel() {
  const expandedNodeId = useDeepWorkBoardStore((s) => s.expandedNodeId)
  const nodes = useDeepWorkBoardStore((s) => s.nodes)
  const actionableNodeIds = useDeepWorkBoardStore((s) => s.actionableNodeIds)
  const collapseNodePanel = useDeepWorkBoardStore((s) => s.collapseNodePanel)
  const recomputeEdges = useDeepWorkBoardStore((s) => s.recomputeEdges)

  const updateTask = useTaskStore((s) => s.updateTask)
  const userTypes = useSortedUserTaskTypes()

  const node = expandedNodeId ? nodes.get(expandedNodeId) ?? null : null
  const isStep = !!node?.step
  const task = node?.task
  const step = node?.step
  const parentTask = node?.parentTask

  const isActionable = expandedNodeId ? actionableNodeIds.has(expandedNodeId) : false

  // Derive initial field values from node data
  const [fields, setFields] = useState<EditableFields>(getInitialFields(node))
  const [isDirty, setIsDirty] = useState(false)

  // Ref tracks the latest fields so handleSave always reads current values,
  // even when called from setTimeout (which would otherwise capture stale state)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  // Reset fields when the expanded node changes
  useEffect(() => {
    const newFields = getInitialFields(node)
    logger.ui.info('Detail panel useEffect reset', {
      expandedNodeId,
      nodeId: node?.id,
      isDirtyRef: isDirtyRef.current,
      oldType: fieldsRef.current.type,
      newType: newFields.type,
      taskType: node?.task?.type,
      stepType: node?.step?.type,
    }, 'dwb-detail-reset')
    setFields(newFields)
    setIsDirty(false)
  }, [expandedNodeId, node])

  const updateField = useCallback(<K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
    logger.ui.info('Detail panel updateField', { key, value }, 'dwb-detail-update-field')
    setFields((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }, [])

  // Save changes back to the task/step
  // Uses refs so this is safe to call from setTimeout without stale closures
  const handleSave = useCallback(async () => {
    const currentFields = fieldsRef.current
    const currentIsDirty = isDirtyRef.current
    logger.ui.info('Detail panel handleSave called', {
      nodeId: node?.id,
      isDirty: currentIsDirty,
      type: currentFields.type,
      name: currentFields.name,
      isStandaloneTask: task && !task.hasSteps,
      isStep: !!step,
    }, 'dwb-detail-save-start')

    if (!node || !currentIsDirty) {
      logger.ui.info('Detail panel handleSave skipped', {
        noNode: !node,
        notDirty: !currentIsDirty,
      }, 'dwb-detail-save-skip')
      return
    }

    try {
      if (task && !task.hasSteps) {
        // Standalone task — update directly
        const payload = {
          name: currentFields.name,
          duration: currentFields.duration,
          importance: currentFields.importance,
          urgency: currentFields.urgency,
          type: currentFields.type,
          notes: currentFields.notes || undefined,
          cognitiveComplexity: currentFields.cognitiveComplexity as Task['cognitiveComplexity'],
          asyncWaitTime: currentFields.asyncWaitTime,
          deadline: currentFields.deadline ?? undefined,
          deadlineType: currentFields.deadlineType as Task['deadlineType'],
        }
        logger.ui.info('Detail panel saving standalone task', {
          taskId: task.id,
          payload: { type: payload.type, name: payload.name },
        }, 'dwb-detail-save-task')
        await updateTask(task.id, payload)
      } else if (step && parentTask) {
        // Workflow step — update the parent workflow's step data
        const updatedSteps = parentTask.steps?.map((s) => {
          if (s.id !== step.id) return s
          return {
            ...s,
            name: currentFields.name,
            duration: currentFields.duration,
            type: currentFields.type,
            importance: currentFields.importance,
            urgency: currentFields.urgency,
            notes: currentFields.notes || undefined,
            cognitiveComplexity: currentFields.cognitiveComplexity as TaskStep['cognitiveComplexity'],
            asyncWaitTime: currentFields.asyncWaitTime,
          }
        })

        if (updatedSteps) {
          logger.ui.info('Detail panel saving step', {
            parentTaskId: parentTask.id,
            stepId: step.id,
            type: currentFields.type,
          }, 'dwb-detail-save-step')
          await updateTask(parentTask.id, {
            steps: updatedSteps,
          } as Partial<Task>)
        }
      }

      setIsDirty(false)
      recomputeEdges() // Refresh derived state
      logger.ui.info('Node details saved successfully', {
        nodeId: node.id,
        type: currentFields.type,
      }, 'dwb-detail-save')
    } catch (error) {
      logger.ui.error('Failed to save node details', {
        error: error instanceof Error ? error.message : String(error),
      }, 'dwb-detail-save-error')
    }
  }, [node, task, step, parentTask, updateTask, recomputeEdges])

  if (!node) return null

  // Derive status for display
  const status = deriveDeepWorkDisplayStatus(node, isActionable)

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#86909c', textTransform: 'uppercase', letterSpacing: 1 }}>
            {isStep ? 'Workflow Step' : 'Task'}
          </Text>
          <StatusBadge status={status} />
        </div>
        <Button
          icon={<IconClose />}
          size="mini"
          type="text"
          onClick={collapseNodePanel}
        />
      </div>

      {/* Name */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>Name</Text>
        <Input
          value={fields.name}
          onChange={(v) => updateField('name', v)}
          onBlur={handleSave}
          onPressEnter={handleSave}
          style={{ fontSize: 14, fontWeight: 500 }}
        />
      </div>

      {/* Type selector */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>Type</Text>
        <Select
          value={fields.type}
          onChange={(v) => {
            updateField('type', v)
            // Auto-save type changes
            setTimeout(handleSave, 0)
          }}
          style={{ width: '100%' }}
        >
          {userTypes.map((ut) => (
            <Select.Option key={ut.id} value={ut.id}>
              {ut.emoji} {ut.name}
            </Select.Option>
          ))}
        </Select>
      </div>

      {/* Duration */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          <IconClockCircle style={{ marginRight: 4 }} />
          Duration
        </Text>
        <Space>
          <InputNumber
            value={fields.duration}
            min={1}
            max={480}
            suffix="min"
            onChange={(v) => updateField('duration', v ?? 30)}
            onBlur={handleSave}
            style={{ width: 120 }}
          />
          <Text style={{ fontSize: 12, color: '#86909c' }}>
            {formatMinutes(fields.duration)}
          </Text>
        </Space>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Importance & Urgency */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          <IconStar style={{ marginRight: 4 }} />
          Importance
        </Text>
        <Slider
          value={fields.importance}
          min={1}
          max={10}
          marks={{ 1: '1', 5: '5', 10: '10' }}
          onChange={(v) => updateField('importance', v as number)}
          onAfterChange={handleSave}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          <IconFire style={{ marginRight: 4 }} />
          Urgency
        </Text>
        <Slider
          value={fields.urgency}
          min={1}
          max={10}
          marks={{ 1: '1', 5: '5', 10: '10' }}
          onChange={(v) => updateField('urgency', v as number)}
          onAfterChange={handleSave}
        />
      </div>

      {/* Cognitive Complexity */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          Cognitive Complexity
        </Text>
        <Space>
          {[1, 2, 3, 4, 5].map((level) => (
            <Button
              key={level}
              size="mini"
              type={fields.cognitiveComplexity === level ? 'primary' : 'outline'}
              onClick={() => {
                updateField('cognitiveComplexity', level)
                setTimeout(handleSave, 0)
              }}
              style={{ width: 32, padding: 0 }}
            >
              {level}
            </Button>
          ))}
        </Space>
      </div>

      {/* Async Wait Time */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          Async Wait Time
        </Text>
        <InputNumber
          value={fields.asyncWaitTime}
          min={0}
          max={1440}
          suffix="min"
          onChange={(v) => updateField('asyncWaitTime', v ?? 0)}
          onBlur={handleSave}
          style={{ width: 120 }}
        />
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Deadline (tasks only) */}
      {!isStep && (
        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
            Deadline
          </Text>
          <DatePicker
            showTime
            value={fields.deadline ? dayjs(fields.deadline) : undefined}
            onChange={(_dateString, date) => {
              updateField('deadline', date?.toDate() ?? null)
              updateField('deadlineType', date ? DeadlineType.Soft : null)
              setTimeout(handleSave, 0)
            }}
            style={{ width: '100%' }}
            allowClear
          />
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
          <IconEdit style={{ marginRight: 4 }} />
          Notes
        </Text>
        <TextArea
          value={fields.notes}
          onChange={(v) => updateField('notes', v)}
          onBlur={handleSave}
          placeholder="Add notes..."
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* Workflow info (for step nodes) */}
      {isStep && parentTask && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
            Workflow
          </Text>
          <Tag color="arcoblue" style={{ fontSize: 12 }}>
            {parentTask.name}
          </Tag>
        </>
      )}

      {/* Save indicator */}
      {isDirty && (
        <div style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="small"
            icon={<IconCheck />}
            onClick={handleSave}
            long
          >
            Save Changes
          </Button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function StatusBadge({ status }: { status: DeepWorkNodeStatus }) {
  const { label, color } = STATUS_LABELS[status]
  return (
    <Tag
      size="small"
      style={{
        backgroundColor: `${color}15`,
        color,
        border: `1px solid ${color}40`,
        marginLeft: 8,
        fontSize: 11,
      }}
    >
      {label}
    </Tag>
  )
}
