/**
 * AddDependencyModal - Modal for adding cross-workflow step dependencies
 *
 * Allows users to specify:
 * - What is blocked (a workflow or a specific step)
 * - What step must complete first (the blocker)
 * - Whether it's a hard block (scheduler enforced) or soft block (warning only)
 * - Optional notes explaining the dependency
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Modal,
  Form,
  Select,
  Switch,
  Input,
  Space,
  Typography,
  Alert,
  Radio,
} from '@arco-design/web-react'
import { IconLock } from '@arco-design/web-react/icon'
import { useEndeavorStore } from '../../store/useEndeavorStore'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import type { Task, TaskStep } from '@shared/types'

const { Text } = Typography
const FormItem = Form.Item

interface AddDependencyModalProps {
  visible: boolean
  onClose: () => void
  endeavorId: string
  /** Pre-select the blocked task (when adding from a specific task row) */
  preselectedBlockedTaskId?: string
  /** Pre-select the blocked step (when adding from a specific step) */
  preselectedBlockedStepId?: string
}

type BlockedType = 'task' | 'step'

export function AddDependencyModal({
  visible,
  onClose,
  endeavorId,
  preselectedBlockedTaskId,
  preselectedBlockedStepId,
}: AddDependencyModalProps) {
  const [form] = Form.useForm()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [blockedType, setBlockedType] = useState<BlockedType>('task')
  const [selectedBlockedTaskId, setSelectedBlockedTaskId] = useState<string | undefined>()
  const [selectedBlockingTaskId, setSelectedBlockingTaskId] = useState<string | undefined>()

  const { addDependency, endeavors } = useEndeavorStore()
  const { tasks } = useTaskStore()

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      form.resetFields()
      if (preselectedBlockedStepId) {
        setBlockedType('step')
        // Find the task that owns this step
        const owningTask = tasks.find((t) =>
          t.steps?.some((s) => s.id === preselectedBlockedStepId),
        )
        setSelectedBlockedTaskId(owningTask?.id)
        form.setFieldValue('blockedStepId', preselectedBlockedStepId)
      } else if (preselectedBlockedTaskId) {
        setBlockedType('task')
        setSelectedBlockedTaskId(preselectedBlockedTaskId)
        form.setFieldValue('blockedTaskId', preselectedBlockedTaskId)
      } else {
        setBlockedType('task')
        setSelectedBlockedTaskId(undefined)
      }
      setSelectedBlockingTaskId(undefined)
      form.setFieldValue('isHardBlock', true)
    }
  }, [visible, preselectedBlockedTaskId, preselectedBlockedStepId, form, tasks])

  // Get workflows (tasks with steps)
  const workflows = useMemo(() => {
    return tasks.filter((t): t is Task & { steps: TaskStep[] } =>
      t.hasSteps && Array.isArray(t.steps) && t.steps.length > 0 && !t.archived,
    )
  }, [tasks])

  // Get the current endeavor's tasks
  const currentEndeavor = useMemo(() => {
    return endeavors.find((e) => e.id === endeavorId)
  }, [endeavors, endeavorId])

  // Tasks that can be blocked (belong to this endeavor)
  const blockableTasks = useMemo(() => {
    if (!currentEndeavor) return []
    return currentEndeavor.items
      .map((item) => item.task)
      .filter((t) => !t.completed && !t.archived)
  }, [currentEndeavor])

  // Steps for the selected blocked task
  const blockedTaskSteps = useMemo(() => {
    if (!selectedBlockedTaskId) return []
    const task = workflows.find((w) => w.id === selectedBlockedTaskId)
    return task?.steps || []
  }, [selectedBlockedTaskId, workflows])

  // Steps for the selected blocking task
  const blockingTaskSteps = useMemo(() => {
    if (!selectedBlockingTaskId) return []
    const task = workflows.find((w) => w.id === selectedBlockingTaskId)
    return task?.steps?.filter((s) => s.status !== 'completed') || []
  }, [selectedBlockingTaskId, workflows])

  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      setIsSubmitting(true)

      const input = {
        endeavorId,
        blockedTaskId: blockedType === 'task' ? values.blockedTaskId : undefined,
        blockedStepId: blockedType === 'step' ? values.blockedStepId : undefined,
        blockingStepId: values.blockingStepId,
        isHardBlock: values.isHardBlock ?? true,
        notes: values.notes?.trim() || undefined,
      }

      await addDependency(input)
      Message.success('Dependency added')
      onClose()
    } catch (err) {
      if (err instanceof Error) {
        Message.error(`Failed to add dependency: ${err.message}`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      title="Add Dependency"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Add Dependency"
      confirmLoading={isSubmitting}
      style={{ width: 560 }}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Alert
          type="info"
          content="Define what must complete before this workflow or step can proceed."
          style={{ marginBottom: 16 }}
        />

        {/* What is being blocked */}
        <FormItem label="Block Type">
          <Radio.Group
            value={blockedType}
            onChange={(val) => {
              setBlockedType(val as BlockedType)
              form.setFieldsValue({ blockedTaskId: undefined, blockedStepId: undefined })
              setSelectedBlockedTaskId(undefined)
            }}
          >
            <Radio value="task">Entire Workflow</Radio>
            <Radio value="step">Specific Step</Radio>
          </Radio.Group>
        </FormItem>

        {blockedType === 'task' ? (
          <FormItem
            label="Blocked Workflow"
            field="blockedTaskId"
            rules={[{ required: true, message: 'Select the workflow to block' }]}
          >
            <Select
              placeholder="Select workflow to block..."
              showSearch
              value={selectedBlockedTaskId}
              onChange={(val) => {
                setSelectedBlockedTaskId(val as string)
                form.setFieldValue('blockedTaskId', val)
              }}
            >
              {blockableTasks.filter((t) => t.hasSteps).map((task) => (
                <Select.Option key={task.id} value={task.id}>
                  {task.name}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        ) : (
          <>
            <FormItem label="Workflow containing step">
              <Select
                placeholder="Select workflow..."
                showSearch
                value={selectedBlockedTaskId}
                onChange={(val) => {
                  setSelectedBlockedTaskId(val as string)
                  form.setFieldValue('blockedStepId', undefined)
                }}
              >
                {blockableTasks.filter((t) => t.hasSteps).map((task) => (
                  <Select.Option key={task.id} value={task.id}>
                    {task.name}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
            <FormItem
              label="Blocked Step"
              field="blockedStepId"
              rules={[{ required: true, message: 'Select the step to block' }]}
            >
              <Select
                placeholder="Select step to block..."
                showSearch
                disabled={!selectedBlockedTaskId}
              >
                {blockedTaskSteps.map((step) => (
                  <Select.Option key={step.id} value={step.id}>
                    {step.name}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--color-border)', margin: '16px 0', paddingTop: 16 }}>
          <Text bold style={{ marginBottom: 8, display: 'block' }}>
            Must Wait For:
          </Text>
        </div>

        {/* What is doing the blocking */}
        <FormItem label="Blocking Workflow">
          <Select
            placeholder="Select workflow containing the blocking step..."
            showSearch
            value={selectedBlockingTaskId}
            onChange={(val) => {
              setSelectedBlockingTaskId(val as string)
              form.setFieldValue('blockingStepId', undefined)
            }}
          >
            {workflows.map((task) => (
              <Select.Option key={task.id} value={task.id}>
                {task.name}
                {task.id === selectedBlockedTaskId && ' (same workflow)'}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        <FormItem
          label="Blocking Step"
          field="blockingStepId"
          rules={[{ required: true, message: 'Select the step that must complete first' }]}
        >
          <Select
            placeholder="Select step that must complete..."
            showSearch
            disabled={!selectedBlockingTaskId}
          >
            {blockingTaskSteps.map((step) => (
              <Select.Option key={step.id} value={step.id}>
                {step.name}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        {/* Hard vs Soft block */}
        <FormItem
          label={
            <Space>
              <Text>Hard Block</Text>
              <IconLock style={{ color: 'var(--color-text-3)' }} />
            </Space>
          }
          field="isHardBlock"
          initialValue={true}
          triggerPropName="checked"
        >
          <Switch />
        </FormItem>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -12, marginBottom: 16 }}>
          Hard blocks prevent scheduling. Soft blocks show warnings but allow proceeding.
        </Text>

        {/* Notes */}
        <FormItem label="Notes (optional)" field="notes">
          <Input.TextArea
            placeholder="Why does this dependency exist?"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </FormItem>
      </Form>
    </Modal>
  )
}
