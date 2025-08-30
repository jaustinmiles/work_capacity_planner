import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Modal,
  Card,
  Space,
  Typography,
  Button,
  Slider,
  Select,
  DatePicker,
  Tag,
  Grid,
  Progress,
  Divider,
  Rate,
  Tooltip,
  Alert,
  Empty,
} from '@arco-design/web-react'
import {
  IconLeft,
  IconRight,
  IconSave,
  IconClose,
  IconCalendar,
  IconClockCircle,
  IconThunderbolt,
  IconFire,
  IconCheckCircle,
  IconEdit,
} from '@arco-design/web-react/icon'
import { Task, TaskStep } from '@shared/types'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { useLogger } from '../../../logging/index.renderer'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface TaskQuickEditModalProps {
  visible: boolean
  onClose: () => void
  initialTaskId?: string
  filter?: 'incomplete' | 'all' | 'high-priority'
  includeWorkflowSteps?: boolean
}

// Union type for items we can edit
type EditableItem = 
  | { type: 'task'; data: Task }
  | { type: 'workflow'; data: Task }  // Workflow is a Task with hasSteps=true
  | { type: 'step'; data: TaskStep; workflow: Task }

interface ItemChanges {
  tasks: { [taskId: string]: Partial<Task> }
  steps: { [stepId: string]: Partial<TaskStep> }
}

// Duration presets in minutes
const DURATION_PRESETS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
  { label: '8h', value: 480 },
]

// Deadline presets
const DEADLINE_PRESETS = [
  { label: 'Today', getValue: () => dayjs().endOf('day').toDate() },
  { label: 'Tomorrow', getValue: () => dayjs().add(1, 'day').endOf('day').toDate() },
  { label: 'This Week', getValue: () => dayjs().endOf('week').toDate() },
  { label: 'Next Week', getValue: () => dayjs().add(1, 'week').endOf('week').toDate() },
  { label: 'No Deadline', getValue: () => null },
]

export function TaskQuickEditModal({
  visible,
  onClose,
  initialTaskId,
  filter = 'incomplete',
  includeWorkflowSteps = true,
}: TaskQuickEditModalProps) {
  const { tasks, updateTask } = useTaskStore()
  const logger = useLogger({ component: 'TaskQuickEditModal' })

  // Build list of editable items (tasks, workflows, and their steps)
  const editableItems = useMemo((): EditableItem[] => {
    const items: EditableItem[] = []
    
    tasks.forEach(task => {
      // Apply filter
      if (filter === 'incomplete' && task.completed) return
      if (filter === 'high-priority' && task.importance < 7 && task.urgency < 7) return
      
      if (task.hasSteps && includeWorkflowSteps) {
        // Add the workflow itself
        items.push({ type: 'workflow', data: task })
        
        // Add each step if we have them loaded
        if (task.steps) {
          task.steps.forEach(step => {
            items.push({ type: 'step', data: step, workflow: task })
          })
        }
      } else {
        // Regular task
        items.push({ type: 'task', data: task })
      }
    })
    
    return items
  }, [tasks, filter, includeWorkflowSteps])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [changes, setChanges] = useState<ItemChanges>({ tasks: {}, steps: {} })
  const [isSaving, setIsSaving] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)

  // Initialize current index based on initialTaskId
  useEffect(() => {
    if (initialTaskId && visible) {
      const index = editableItems.findIndex(item => {
        if (item.type === 'task' || item.type === 'workflow') {
          return item.data.id === initialTaskId
        }
        return false
      })
      if (index !== -1) {
        setCurrentIndex(index)
      }
    }
  }, [initialTaskId, visible, editableItems])

  // Current item being edited
  const currentItem = editableItems[currentIndex]
  const getCurrentChanges = () => {
    if (!currentItem) return {}
    if (currentItem.type === 'step') {
      return changes.steps[currentItem.data.id] || {}
    }
    return changes.tasks[currentItem.data.id] || {}
  }
  const currentChanges = getCurrentChanges()
  
  const getEditedData = () => {
    if (!currentItem) return null
    if (currentItem.type === 'step') {
      return { ...currentItem.data, ...currentChanges }
    }
    return { ...currentItem.data, ...currentChanges }
  }
  const editedData = getEditedData()

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Navigation
      if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault()
        navigatePrevious()
      } else if (e.key === 'ArrowRight' || e.key === 'k') {
        e.preventDefault()
        navigateNext()
      }
      // Save
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        saveCurrentItem()
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveAllChanges()
      }
      // Cancel
      else if (e.key === 'Escape') {
        handleClose()
      }
      // Quick cognitive complexity
      else if (['1', '2', '3', '4', '5'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
          updateField('cognitiveComplexity', parseInt(e.key) as 1 | 2 | 3 | 4 | 5)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, currentIndex, changes])

  const navigatePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1))
  }

  const navigateNext = () => {
    setCurrentIndex(prev => Math.min(editableItems.length - 1, prev + 1))
  }

  const updateField = (field: string, value: any) => {
    if (!currentItem) return

    if (currentItem.type === 'step') {
      setChanges(prev => ({
        ...prev,
        steps: {
          ...prev.steps,
          [currentItem.data.id]: {
            ...prev.steps[currentItem.data.id],
            [field]: value,
          },
        },
      }))
    } else {
      setChanges(prev => ({
        ...prev,
        tasks: {
          ...prev.tasks,
          [currentItem.data.id]: {
            ...prev.tasks[currentItem.data.id],
            [field]: value,
          },
        },
      }))
    }
    setUnsavedChanges(true)

    const itemName = currentItem.type === 'step' ? currentItem.data.name : currentItem.data.name
    logger.debug(`Updated ${field} for ${currentItem.type} ${itemName}`, { field, value })
  }

  const saveCurrentItem = async () => {
    if (!currentItem || !currentChanges || Object.keys(currentChanges).length === 0) {
      return
    }

    try {
      if (currentItem.type === 'step') {
        // Update the step by updating the parent workflow with modified steps
        const updatedSteps = currentItem.workflow.steps?.map(s => 
          s.id === currentItem.data.id 
            ? { ...s, ...currentChanges }
            : s
        )
        
        await updateTask(currentItem.workflow.id, { steps: updatedSteps })
        
        // Clear changes for this step
        setChanges(prev => {
          const newChanges = { ...prev }
          delete newChanges.steps[currentItem.data.id]
          return { ...newChanges, steps: newChanges.steps }
        })
      } else {
        await updateTask(currentItem.data.id, currentChanges)
        
        // Clear changes for this task
        setChanges(prev => {
          const newChanges = { ...prev }
          delete newChanges.tasks[currentItem.data.id]
          return { ...newChanges, tasks: newChanges.tasks }
        })
      }

      const itemName = currentItem.type === 'step' ? currentItem.data.name : currentItem.data.name
      Message.success(`Updated "${itemName}"`)
      logger.info(`Saved changes for ${currentItem.type} ${itemName}`, currentChanges)
    } catch (error) {
      logger.error(`Failed to save ${currentItem.type}`, error)
      Message.error(`Failed to save ${currentItem.type}`)
    }
  }

  const saveAllChanges = async () => {
    const taskChanges = Object.entries(changes.tasks)
    const stepChanges = Object.entries(changes.steps)
    const totalChanges = taskChanges.length + stepChanges.length
    
    if (totalChanges === 0) {
      Message.info('No changes to save')
      return
    }

    setIsSaving(true)
    logger.info(`Saving ${taskChanges.length} tasks and ${stepChanges.length} steps`)

    try {
      // Save all changes in parallel
      const promises: Promise<any>[] = []
      
      // Save task changes
      taskChanges.forEach(([taskId, taskData]) => {
        promises.push(updateTask(taskId, taskData))
      })
      
      // Save step changes - group by workflow and update each workflow once
      const workflowStepChanges = new Map<string, { workflow: Task; stepChanges: Array<{ stepId: string; changes: any }> }>()
      
      stepChanges.forEach(([stepId, stepData]) => {
        const item = editableItems.find(i => i.type === 'step' && i.data.id === stepId)
        if (item && item.type === 'step') {
          const workflowId = item.workflow.id
          if (!workflowStepChanges.has(workflowId)) {
            workflowStepChanges.set(workflowId, { workflow: item.workflow, stepChanges: [] })
          }
          workflowStepChanges.get(workflowId)!.stepChanges.push({ stepId, changes: stepData })
        }
      })
      
      // Update each workflow with all its step changes
      workflowStepChanges.forEach(({ workflow, stepChanges: changes }) => {
        const updatedSteps = workflow.steps?.map(step => {
          const stepChange = changes.find(c => c.stepId === step.id)
          return stepChange ? { ...step, ...stepChange.changes } : step
        })
        promises.push(updateTask(workflow.id, { steps: updatedSteps }))
      })
      
      await Promise.all(promises)

      Message.success(`Updated ${totalChanges} items`)
      setChanges({ tasks: {}, steps: {} })
      setUnsavedChanges(false)
      logger.info('All changes saved successfully')
    } catch (error) {
      logger.error('Failed to save changes', error)
      Message.error('Failed to save some changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (unsavedChanges) {
      Modal.confirm({
        title: 'Unsaved Changes',
        content: 'You have unsaved changes. Do you want to save them before closing?',
        okText: 'Save & Close',
        cancelText: 'Discard',
        onOk: async () => {
          await saveAllChanges()
          onClose()
        },
        onCancel: () => {
          setChanges({ tasks: {}, steps: {} })
          setUnsavedChanges(false)
          onClose()
        },
      })
    } else {
      onClose()
    }
  }

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  const getModifiedFieldsCount = (): number => {
    const taskFieldCount = Object.values(changes.tasks).reduce((total, taskChanges) =>
      total + Object.keys(taskChanges).length, 0,
    )
    const stepFieldCount = Object.values(changes.steps).reduce((total, stepChanges) =>
      total + Object.keys(stepChanges).length, 0,
    )
    return taskFieldCount + stepFieldCount
  }

  if (!editedData || !currentItem) {
    return (
      <Modal
        title="Quick Edit"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 600 }}
      >
        <Empty description="No tasks to edit" />
      </Modal>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <IconEdit />
          <span>Quick Edit</span>
          {currentItem && (
            <Tag color={
              currentItem.type === 'workflow' ? 'purple' :
              currentItem.type === 'step' ? 'green' : 'blue'
            }>
              {currentItem.type === 'workflow' ? 'Workflow' :
               currentItem.type === 'step' ? 'Step' : 'Task'}
            </Tag>
          )}
          <Tag color="blue">
            {currentIndex + 1} of {editableItems.length}
          </Tag>
          {unsavedChanges && (
            <Tag color="orange">
              {getModifiedFieldsCount()} unsaved changes
            </Tag>
          )}
        </Space>
      }
      visible={visible}
      onCancel={handleClose}
      style={{ width: 800 }}
      footer={
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            type="primary"
            onClick={saveCurrentItem}
            disabled={!currentChanges || Object.keys(currentChanges).length === 0}
          >
            Save Current
          </Button>
          <Button
            type="primary"
            status="success"
            onClick={saveAllChanges}
            loading={isSaving}
            disabled={Object.keys(changes.tasks).length === 0 && Object.keys(changes.steps).length === 0}
          >
            Save All ({Object.keys(changes.tasks).length + Object.keys(changes.steps).length})
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Navigation */}
        <Row justify="space-between" align="center">
          <Col span={4}>
            <Button
              icon={<IconLeft />}
              onClick={navigatePrevious}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
          </Col>
          <Col span={16} style={{ textAlign: 'center' }}>
            <Title heading={5}>
              {currentItem?.type === 'step' && (
                <Text type="secondary" style={{ fontSize: 14 }}>
                  {currentItem.workflow.name} › 
                </Text>
              )}
              {editedData?.name}
            </Title>
            <Progress
              percent={(currentIndex + 1) / editableItems.length * 100}
              showText={false}
              size="small"
            />
          </Col>
          <Col span={4} style={{ textAlign: 'right' }}>
            <Button
              icon={<IconRight />}
              onClick={navigateNext}
              disabled={currentIndex === editableItems.length - 1}
            >
              Next
            </Button>
          </Col>
        </Row>

        <Divider />

        {/* Duration Slider */}
        <div>
          <Text bold>
            <IconClockCircle /> Duration: {formatDuration(editedData?.duration || 0)}
          </Text>
          <Slider
            value={editedData?.duration || 0}
            min={15}
            max={480}
            step={15}
            marks={{
              15: '15m',
              60: '1h',
              120: '2h',
              240: '4h',
              480: '8h',
            }}
            onChange={(value) => updateField('duration', value as number)}
            style={{ marginTop: 8 }}
          />
          <Space style={{ marginTop: 8 }}>
            {DURATION_PRESETS.map(preset => (
              <Button
                key={preset.value}
                size="small"
                type={editedData?.duration === preset.value ? 'primary' : 'default'}
                onClick={() => updateField('duration', preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </Space>
        </div>

        {/* Priority Sliders - Only for tasks and workflows */}
        {currentItem?.type !== 'step' && (
          <Row gutter={16}>
            <Col span={12}>
              <Text bold>
                <IconFire /> Importance: {(editedData as Task)?.importance || 5}
              </Text>
              <Slider
                value={(editedData as Task)?.importance || 5}
                min={1}
                max={10}
                marks={{
                  1: '1',
                  5: '5',
                  10: '10',
                }}
                onChange={(value) => updateField('importance', value as number)}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col span={12}>
              <Text bold>
                <IconThunderbolt /> Urgency: {(editedData as Task)?.urgency || 5}
              </Text>
              <Slider
                value={(editedData as Task)?.urgency || 5}
                min={1}
                max={10}
                marks={{
                  1: '1',
                  5: '5',
                  10: '10',
                }}
                onChange={(value) => updateField('urgency', value as number)}
                style={{ marginTop: 8 }}
              />
            </Col>
          </Row>
        )}

        {/* Type and Cognitive Complexity */}
        <Row gutter={16}>
          <Col span={12}>
            <Text bold style={{ display: 'block', marginBottom: 8 }}>Type</Text>
            <Select
              value={(editedData as any)?.type || TaskType.Focused}
              onChange={(value) => updateField('type', value)}
              style={{ width: '100%' }}
            >
              <Select.Option value={TaskType.Focused}>
                <Tag color="blue">Focused</Tag>
              </Select.Option>
              <Select.Option value={TaskType.Admin}>
                <Tag color="green">Admin</Tag>
              </Select.Option>
              <Select.Option value={TaskType.Personal}>
                <Tag color="purple">Personal</Tag>
              </Select.Option>
            </Select>
          </Col>
          <Col span={12}>
            <Text bold style={{ display: 'block', marginBottom: 8 }}>
              Cognitive Complexity
            </Text>
            <Rate
              value={editedData?.cognitiveComplexity || 3}
              onChange={(value) => updateField('cognitiveComplexity', value as 1 | 2 | 3 | 4 | 5)}
              style={{ fontSize: 24 }}
            />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              (Press 1-5)
            </Text>
          </Col>
        </Row>

        {/* Deadline - Only for tasks and workflows */}
        {currentItem?.type !== 'step' && (
          <div>
            <Text bold style={{ display: 'block', marginBottom: 8 }}>
              <IconCalendar /> Deadline
            </Text>
            <Space>
              {DEADLINE_PRESETS.map(preset => (
                <Button
                  key={preset.label}
                  size="small"
                  onClick={() => {
                    const value = preset.getValue()
                    updateField('deadline', value as Date | undefined)
                  }}
                  type={
                    preset.label === 'No Deadline' && !(editedData as Task)?.deadline ? 'primary' :
                    preset.label !== 'No Deadline' && (editedData as Task)?.deadline && preset.getValue() &&
                    dayjs((editedData as Task).deadline).isSame(preset.getValue()!, 'day') ? 'primary' : 'default'
                  }
                >
                  {preset.label}
                </Button>
              ))}
              <DatePicker
                value={(editedData as Task)?.deadline ? dayjs((editedData as Task).deadline) : undefined}
                onChange={(dateString, date) => updateField('deadline', date?.toDate())}
                shortcuts={[
                  {
                    text: 'Today',
                    value: () => dayjs().endOf('day'),
                  },
                  {
                    text: 'Tomorrow',
                    value: () => dayjs().add(1, 'day').endOf('day'),
                  },
                  {
                    text: 'Next Week',
                    value: () => dayjs().add(1, 'week').endOf('week'),
                  },
                ]}
              />
            </Space>
            {(editedData as Task)?.deadline && (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                {dayjs((editedData as Task).deadline).format('MMM D, YYYY')}
              </Tag>
            )}
          </div>
        )}

        {/* Async Wait Time and Status - Show for steps */}
        {currentItem?.type === 'step' && (
          <>
            <div>
              <Text bold style={{ display: 'block', marginBottom: 8 }}>
                <IconClockCircle /> Async Wait Time: {formatDuration((editedData as TaskStep)?.asyncWaitTime || 0)}
              </Text>
              <Slider
                value={(editedData as TaskStep)?.asyncWaitTime || 0}
                min={0}
                max={240}
                step={5}
                marks={{
                  0: '0',
                  30: '30m',
                  60: '1h',
                  120: '2h',
                  240: '4h',
                }}
                onChange={(value) => updateField('asyncWaitTime', value as number)}
                style={{ marginTop: 8 }}
              />
            </div>
            
            <div>
              <Text bold style={{ display: 'block', marginBottom: 8 }}>Step Status</Text>
              <Select
                value={(editedData as TaskStep)?.status || 'pending'}
                onChange={(value) => updateField('status', value)}
                style={{ width: 200 }}
              >
                <Select.Option value="pending">Pending</Select.Option>
                <Select.Option value="in_progress">In Progress</Select.Option>
                <Select.Option value="waiting">Waiting</Select.Option>
                <Select.Option value="completed">Completed</Select.Option>
                <Select.Option value="skipped">Skipped</Select.Option>
              </Select>
            </div>
          </>
        )}

        {/* Keyboard shortcuts help */}
        <Alert
          type="info"
          content={
            <Space size="small" wrap>
              <Text>Shortcuts:</Text>
              <Tag>←/→ Navigate</Tag>
              <Tag>1-5 Complexity</Tag>
              <Tag>Enter Save Current</Tag>
              <Tag>Ctrl+S Save All</Tag>
              <Tag>Esc Cancel</Tag>
            </Space>
          }
        />

        {/* Modified fields indicator */}
        {currentChanges && Object.keys(currentChanges).length > 0 && (
          <Alert
            type="warning"
            content={
              <Space>
                <Text>Modified fields:</Text>
                {Object.keys(currentChanges).map(field => (
                  <Tag key={field} color="orange">{field}</Tag>
                ))}
              </Space>
            }
          />
        )}
      </Space>
    </Modal>
  )
}
