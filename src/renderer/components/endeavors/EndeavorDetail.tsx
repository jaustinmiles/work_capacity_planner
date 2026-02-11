/**
 * EndeavorDetail - Shows endeavor details with task management
 *
 * Displays:
 * - Endeavor metadata and progress
 * - List of associated tasks with drag-to-reorder
 * - Add/remove task functionality
 * - Cross-endeavor dependency visualization
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Card,
  Typography,
  Space,
  Tag,
  Button,
  Progress,
  List,
  Empty,
  Spin,
  Modal,
  Select,
  Divider,
  Alert,
} from '@arco-design/web-react'
import {
  IconArrowLeft,
  IconPlus,
  IconDelete,
  IconLink,
  IconDragDotVertical,
} from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { EndeavorStatus, TaskStatus } from '@shared/enums'
import { calculateEndeavorProgress } from '@shared/endeavor-utils'
import type { EndeavorWithTasks, Task, EndeavorItem } from '@shared/types'
import { useEndeavorStore } from '../../store/useEndeavorStore'
import { useTaskStore } from '../../store/useTaskStore'

const { Title, Text } = Typography

interface EndeavorDetailProps {
  endeavorId: string
  onBack: () => void
}

const STATUS_COLORS: Record<string, string> = {
  [TaskStatus.NotStarted]: 'gray',
  [TaskStatus.InProgress]: 'arcoblue',
  [TaskStatus.Waiting]: 'orange',
  [TaskStatus.Completed]: 'green',
}

interface CrossEndeavorDependency {
  taskId: string
  taskName: string
  dependencies: Array<{
    dependencyId: string
    dependencyName: string
    endeavorId: string
    endeavorName: string
    isCompleted: boolean
  }>
}

interface BlockingEndeavor {
  endeavorId: string
  endeavorName: string
  blockingTaskCount: number
}

export function EndeavorDetail({ endeavorId, onBack }: EndeavorDetailProps) {
  const [addTaskModalVisible, setAddTaskModalVisible] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [endeavor, setEndeavor] = useState<EndeavorWithTasks | null>(null)
  const [crossDeps, setCrossDeps] = useState<{
    dependencies: CrossEndeavorDependency[]
    blockingEndeavors: BlockingEndeavor[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { addTaskToEndeavor, removeTaskFromEndeavor } = useEndeavorStore()
  const { tasks } = useTaskStore()

  // Load endeavor details
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const db = getDatabase()
        const [endeavorData, depsData] = await Promise.all([
          db.getEndeavorById(endeavorId),
          db.getCrossEndeavorDependencies(endeavorId),
        ])
        setEndeavor(endeavorData)
        setCrossDeps(depsData)
      } catch (err) {
        Message.error(`Failed to load endeavor: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [endeavorId])

  // Filter tasks not already in endeavor
  const availableTasks = useMemo(() => {
    if (!tasks || !endeavor) return []
    const existingTaskIds = new Set(endeavor.items.map((item) => item.taskId))
    return tasks.filter((task: Task) => !existingTaskIds.has(task.id) && !task.archived)
  }, [tasks, endeavor])

  const handleAddTask = async () => {
    if (!selectedTaskId) return
    try {
      await addTaskToEndeavor(endeavorId, selectedTaskId)
      // Reload endeavor
      const db = getDatabase()
      const updated = await db.getEndeavorById(endeavorId)
      setEndeavor(updated)
      setAddTaskModalVisible(false)
      setSelectedTaskId(null)
      Message.success('Task added to endeavor')
    } catch (err) {
      Message.error(`Failed to add task: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleRemoveTask = async (taskId: string) => {
    try {
      await removeTaskFromEndeavor(endeavorId, taskId)
      // Reload endeavor
      const db = getDatabase()
      const updated = await db.getEndeavorById(endeavorId)
      setEndeavor(updated)
      Message.success('Task removed from endeavor')
    } catch (err) {
      Message.error(`Failed to remove task: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size={32} />
        </div>
      </Card>
    )
  }

  if (!endeavor) {
    return (
      <Card>
        <Empty description="Endeavor not found" />
        <Button onClick={onBack} style={{ marginTop: 16 }}>
          Go Back
        </Button>
      </Card>
    )
  }

  const progress = calculateEndeavorProgress(endeavor)
  const hasBlockingDeps = crossDeps?.blockingEndeavors && crossDeps.blockingEndeavors.length > 0

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Header */}
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Button icon={<IconArrowLeft />} onClick={onBack} type="text" />
            <div
              style={{
                width: 8,
                height: 32,
                borderRadius: 4,
                backgroundColor: endeavor.color || 'var(--color-fill-3)',
              }}
            />
            <div>
              <Title heading={4} style={{ margin: 0 }}>
                {endeavor.name}
              </Title>
              {endeavor.description && (
                <Text type="secondary">{endeavor.description}</Text>
              )}
            </div>
          </Space>
          <Tag
            color={
              endeavor.status === EndeavorStatus.Active
                ? 'arcoblue'
                : endeavor.status === EndeavorStatus.Completed
                  ? 'green'
                  : endeavor.status === EndeavorStatus.Paused
                    ? 'orange'
                    : 'gray'
            }
          >
            {endeavor.status}
          </Tag>
        </Space>

        {/* Progress */}
        <Card style={{ background: 'var(--color-fill-1)' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text bold>Progress</Text>
              <Text>
                {progress.completedTasks}/{progress.totalTasks} tasks completed
              </Text>
            </Space>
            <Progress
              percent={progress.percentComplete}
              color={progress.percentComplete === 100 ? 'green' : undefined}
            />
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {progress.completedDuration} / {progress.totalDuration} minutes
              </Text>
              {progress.inProgressTasks > 0 && (
                <Tag size="small" color="arcoblue">
                  {progress.inProgressTasks} in progress
                </Tag>
              )}
            </Space>
          </Space>
        </Card>

        {/* Cross-endeavor dependencies warning */}
        {hasBlockingDeps && (
          <Alert
            type="warning"
            title="Blocked by other endeavors"
            content={
              <Space direction="vertical">
                <Text>
                  This endeavor has tasks waiting on work from other endeavors:
                </Text>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {crossDeps.blockingEndeavors.map((blocker) => (
                    <li key={blocker.endeavorId}>
                      <Text bold>{blocker.endeavorName}</Text>
                      <Text type="secondary">
                        {' '}
                        ({blocker.blockingTaskCount} blocking task
                        {blocker.blockingTaskCount > 1 ? 's' : ''})
                      </Text>
                    </li>
                  ))}
                </ul>
              </Space>
            }
          />
        )}

        <Divider style={{ margin: '8px 0' }} />

        {/* Tasks */}
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title heading={6} style={{ margin: 0 }}>
            Tasks & Workflows
          </Title>
          <Button
            type="primary"
            icon={<IconPlus />}
            size="small"
            onClick={() => setAddTaskModalVisible(true)}
          >
            Add Task
          </Button>
        </Space>

        {endeavor.items.length === 0 ? (
          <Empty description="No tasks added yet. Add tasks to track progress." />
        ) : (
          <List
            dataSource={endeavor.items}
            render={(item: EndeavorItem & { task: Task }) => {
              const task = item.task
              const hasCrossDeps = crossDeps?.dependencies.some(
                (d) => d.taskId === task.id,
              )

              return (
                <List.Item
                  key={item.id}
                  actions={[
                    <Button
                      key="remove"
                      type="text"
                      status="danger"
                      size="small"
                      icon={<IconDelete />}
                      onClick={() => handleRemoveTask(task.id)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <IconDragDotVertical
                        style={{ color: 'var(--color-text-3)', cursor: 'grab' }}
                      />
                    }
                    title={
                      <Space>
                        <Text>{task.name}</Text>
                        <Tag color={STATUS_COLORS[task.overallStatus]} size="small">
                          {task.overallStatus.replace('_', ' ')}
                        </Tag>
                        {task.hasSteps && (
                          <Tag size="small" color="purple">
                            Workflow ({task.steps?.length || 0} steps)
                          </Tag>
                        )}
                        {hasCrossDeps && (
                          <Tag icon={<IconLink />} size="small" color="orange">
                            Cross-endeavor deps
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {task.duration} min
                        {task.deadline &&
                          ` | Due: ${new Date(task.deadline).toLocaleDateString()}`}
                      </Text>
                    }
                  />
                </List.Item>
              )
            }}
            bordered={false}
          />
        )}
      </Space>

      {/* Add Task Modal */}
      <Modal
        visible={addTaskModalVisible}
        onCancel={() => {
          setAddTaskModalVisible(false)
          setSelectedTaskId(null)
        }}
        title="Add Task to Endeavor"
        okText="Add"
        onOk={handleAddTask}
        okButtonProps={{ disabled: !selectedTaskId }}
      >
        <Select
          placeholder="Select a task to add"
          style={{ width: '100%' }}
          value={selectedTaskId || undefined}
          onChange={(val) => setSelectedTaskId(val as string)}
          showSearch
          filterOption={(input, option) => {
            // Option children is the task name text
            const optionNode = option as { children?: React.ReactNode }
            const label = typeof optionNode?.children === 'string' ? optionNode.children : ''
            return label.toLowerCase().includes(input.toLowerCase())
          }}
        >
          {availableTasks.map((task: Task) => (
            <Select.Option key={task.id} value={task.id}>
              {task.name}
              {task.hasSteps ? ' (Workflow)' : ''}
            </Select.Option>
          ))}
        </Select>
        {availableTasks.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            All tasks are already in this endeavor or archived.
          </Text>
        )}
      </Modal>
    </Card>
  )
}
