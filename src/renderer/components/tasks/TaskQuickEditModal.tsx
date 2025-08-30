import { useState, useEffect, useCallback } from 'react'
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
import { Task } from '@shared/types'
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
}

interface TaskChanges {
  [taskId: string]: Partial<Task>
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
}: TaskQuickEditModalProps) {
  const { tasks, updateTask } = useTaskStore()
  const logger = useLogger({ component: 'TaskQuickEditModal' })

  // Filter tasks based on criteria
  const filteredTasks = tasks.filter(task => {
    if (filter === 'incomplete') return !task.completed
    if (filter === 'high-priority') return task.importance >= 7 || task.urgency >= 7
    return true
  })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [changes, setChanges] = useState<TaskChanges>({})
  const [isSaving, setIsSaving] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)

  // Initialize current index based on initialTaskId
  useEffect(() => {
    if (initialTaskId && visible) {
      const index = filteredTasks.findIndex(t => t.id === initialTaskId)
      if (index !== -1) {
        setCurrentIndex(index)
      }
    }
  }, [initialTaskId, visible, filteredTasks])

  // Current task being edited
  const currentTask = filteredTasks[currentIndex]
  const currentChanges = currentTask ? changes[currentTask.id] || {} : {}
  const editedTask = currentTask ? { ...currentTask, ...currentChanges } : null

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
        saveCurrentTask()
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
    setCurrentIndex(prev => Math.min(filteredTasks.length - 1, prev + 1))
  }

  const updateField = <K extends keyof Task>(field: K, value: Task[K]) => {
    if (!currentTask) return

    setChanges(prev => ({
      ...prev,
      [currentTask.id]: {
        ...prev[currentTask.id],
        [field]: value,
      },
    }))
    setUnsavedChanges(true)

    logger.debug(`Updated ${field} for task ${currentTask.name}`, { field, value })
  }

  const saveCurrentTask = async () => {
    if (!currentTask || !currentChanges || Object.keys(currentChanges).length === 0) {
      return
    }

    try {
      await updateTask(currentTask.id, currentChanges)

      // Clear changes for this task
      setChanges(prev => {
        const newChanges = { ...prev }
        delete newChanges[currentTask.id]
        return newChanges
      })

      Message.success(`Updated "${currentTask.name}"`)
      logger.info(`Saved changes for task ${currentTask.name}`, currentChanges)
    } catch (error) {
      logger.error('Failed to save task', error)
      Message.error('Failed to save task')
    }
  }

  const saveAllChanges = async () => {
    const changeEntries = Object.entries(changes)
    if (changeEntries.length === 0) {
      Message.info('No changes to save')
      return
    }

    setIsSaving(true)
    logger.info(`Saving changes for ${changeEntries.length} tasks`)

    try {
      // Save all changes in parallel
      await Promise.all(
        changeEntries.map(([taskId, taskChanges]) =>
          updateTask(taskId, taskChanges),
        ),
      )

      Message.success(`Updated ${changeEntries.length} tasks`)
      setChanges({})
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
          setChanges({})
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
    return Object.values(changes).reduce((total, taskChanges) =>
      total + Object.keys(taskChanges).length, 0,
    )
  }

  if (!editedTask) {
    return (
      <Modal
        title="Quick Edit Tasks"
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
          <span>Quick Edit Tasks</span>
          <Tag color="blue">
            {currentIndex + 1} of {filteredTasks.length}
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
            onClick={saveCurrentTask}
            disabled={!currentChanges || Object.keys(currentChanges).length === 0}
          >
            Save Current
          </Button>
          <Button
            type="primary"
            status="success"
            onClick={saveAllChanges}
            loading={isSaving}
            disabled={Object.keys(changes).length === 0}
          >
            Save All ({Object.keys(changes).length})
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
            <Title heading={5}>{editedTask.name}</Title>
            <Progress
              percent={(currentIndex + 1) / filteredTasks.length * 100}
              showText={false}
              size="small"
            />
          </Col>
          <Col span={4} style={{ textAlign: 'right' }}>
            <Button
              icon={<IconRight />}
              onClick={navigateNext}
              disabled={currentIndex === filteredTasks.length - 1}
            >
              Next
            </Button>
          </Col>
        </Row>

        <Divider />

        {/* Duration Slider */}
        <div>
          <Text bold>
            <IconClockCircle /> Duration: {formatDuration(editedTask.duration)}
          </Text>
          <Slider
            value={editedTask.duration}
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
                type={editedTask.duration === preset.value ? 'primary' : 'default'}
                onClick={() => updateField('duration', preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </Space>
        </div>

        {/* Priority Sliders */}
        <Row gutter={16}>
          <Col span={12}>
            <Text bold>
              <IconFire /> Importance: {editedTask.importance}
            </Text>
            <Slider
              value={editedTask.importance}
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
              <IconThunderbolt /> Urgency: {editedTask.urgency}
            </Text>
            <Slider
              value={editedTask.urgency}
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

        {/* Type and Cognitive Complexity */}
        <Row gutter={16}>
          <Col span={12}>
            <Text bold style={{ display: 'block', marginBottom: 8 }}>Type</Text>
            <Select
              value={editedTask.type}
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
              value={editedTask.cognitiveComplexity || 3}
              onChange={(value) => updateField('cognitiveComplexity', value as 1 | 2 | 3 | 4 | 5)}
              style={{ fontSize: 24 }}
            />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              (Press 1-5)
            </Text>
          </Col>
        </Row>

        {/* Deadline */}
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
                  preset.label === 'No Deadline' && !editedTask.deadline ? 'primary' :
                  preset.label !== 'No Deadline' && editedTask.deadline && preset.getValue() &&
                  dayjs(editedTask.deadline).isSame(preset.getValue()!, 'day') ? 'primary' : 'default'
                }
              >
                {preset.label}
              </Button>
            ))}
            <DatePicker
              value={editedTask.deadline ? dayjs(editedTask.deadline) : undefined}
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
          {editedTask.deadline && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              {dayjs(editedTask.deadline).format('MMM D, YYYY')}
            </Tag>
          )}
        </div>

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
