/**
 * EndeavorDetail - Shows endeavor details with task management
 *
 * Displays:
 * - Endeavor metadata and progress
 * - List of associated tasks with drag-to-reorder
 * - Add/remove task functionality
 * - Cross-endeavor dependency visualization
 * - Step-level dependencies with status indicators
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
  Popconfirm,
  Collapse,
  Tooltip,
} from '@arco-design/web-react'
import {
  IconArrowLeft,
  IconPlus,
  IconDelete,
  IconLink,
  IconDragDotVertical,
  IconLock,
  IconExclamationCircle,
  IconCheck,
  IconClockCircle,
} from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { EndeavorStatus, TaskStatus, StepStatus } from '@shared/enums'
import { calculateEndeavorProgress } from '@shared/endeavor-utils'
import type { EndeavorWithTasks, Task, EndeavorItem, EndeavorDependencyWithNames } from '@shared/types'
import { useEndeavorStore } from '../../store/useEndeavorStore'
import { useTaskStore } from '../../store/useTaskStore'
import { AddDependencyModal } from './AddDependencyModal'

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
  const [addDepModalVisible, setAddDepModalVisible] = useState(false)
  const [addDepForTaskId, setAddDepForTaskId] = useState<string | undefined>()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [endeavor, setEndeavor] = useState<EndeavorWithTasks | null>(null)
  const [crossDeps, setCrossDeps] = useState<{
    dependencies: CrossEndeavorDependency[]
    blockingEndeavors: BlockingEndeavor[]
  } | null>(null)
  const [stepDeps, setStepDeps] = useState<EndeavorDependencyWithNames[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const {
    addTaskToEndeavor,
    removeTaskFromEndeavor,
    loadDependencies,
    removeDependency,
  } = useEndeavorStore()
  const { tasks } = useTaskStore()

  // Load endeavor details
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const db = getDatabase()
        const [endeavorData, depsData, stepDepsData] = await Promise.all([
          db.getEndeavorById(endeavorId),
          db.getCrossEndeavorDependencies(endeavorId),
          loadDependencies(endeavorId),
        ])
        setEndeavor(endeavorData)
        setCrossDeps(depsData)
        setStepDeps(stepDepsData)
      } catch (err) {
        Message.error(`Failed to load endeavor: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [endeavorId, loadDependencies])

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

  const handleRemoveDependency = async (depId: string) => {
    try {
      await removeDependency(depId, endeavorId)
      const updated = await loadDependencies(endeavorId)
      setStepDeps(updated)
      Message.success('Dependency removed')
    } catch (err) {
      Message.error(`Failed to remove dependency: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleAddDependencyForTask = (taskId: string) => {
    setAddDepForTaskId(taskId)
    setAddDepModalVisible(true)
  }

  const handleDependencyModalClose = async () => {
    setAddDepModalVisible(false)
    setAddDepForTaskId(undefined)
    // Reload dependencies
    const updated = await loadDependencies(endeavorId)
    setStepDeps(updated)
  }

  // Get dependencies for a specific task
  const getDepsForTask = (taskId: string) => {
    return stepDeps.filter(
      (d) => d.blockedTaskId === taskId || (d.blockedStepId && tasks.find((t) => t.id === taskId)?.steps?.some((s) => s.id === d.blockedStepId)),
    )
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

        {/* Step-level Dependencies Section */}
        {stepDeps.length > 0 && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Collapse defaultActiveKey={['deps']} bordered={false}>
              <Collapse.Item
                header={
                  <Space>
                    <Text bold>Step Dependencies</Text>
                    <Tag size="small" color={stepDeps.some((d) => d.isHardBlock && d.blockingStepStatus !== StepStatus.Completed) ? 'red' : 'green'}>
                      {stepDeps.length} defined
                    </Tag>
                  </Space>
                }
                name="deps"
              >
                <List
                  dataSource={stepDeps}
                  render={(dep: EndeavorDependencyWithNames) => {
                    const isBlocking = dep.blockingStepStatus !== StepStatus.Completed
                    const blockedName = dep.blockedTaskName || dep.blockedStepName || 'Unknown'
                    const blockedType = dep.blockedTaskId ? 'Workflow' : 'Step'

                    return (
                      <List.Item
                        key={dep.id}
                        actions={[
                          <Popconfirm
                            key="remove"
                            title="Remove this dependency?"
                            onOk={() => handleRemoveDependency(dep.id)}
                          >
                            <Button type="text" status="danger" size="small" icon={<IconDelete />} />
                          </Popconfirm>,
                        ]}
                      >
                        <Space direction="vertical" size="mini" style={{ width: '100%' }}>
                          <Space>
                            {dep.isHardBlock ? (
                              <Tooltip content="Hard block - prevents scheduling">
                                <IconLock style={{ color: isBlocking ? 'var(--color-danger-6)' : 'var(--color-success-6)' }} />
                              </Tooltip>
                            ) : (
                              <Tooltip content="Soft block - warning only">
                                <IconExclamationCircle style={{ color: 'var(--color-warning-6)' }} />
                              </Tooltip>
                            )}
                            <Text>
                              <Text bold>{blockedName}</Text>
                              <Text type="secondary"> ({blockedType})</Text>
                            </Text>
                          </Space>
                          <Space style={{ marginLeft: 20 }}>
                            <Text type="secondary">waits for</Text>
                            <Tag
                              size="small"
                              color={isBlocking ? 'orange' : 'green'}
                              icon={isBlocking ? <IconClockCircle /> : <IconCheck />}
                            >
                              {dep.blockingStepName}
                            </Tag>
                            <Text type="secondary">
                              from &ldquo;{dep.blockingTaskName}&rdquo;
                              {dep.blockingEndeavorName && ` (${dep.blockingEndeavorName})`}
                            </Text>
                          </Space>
                          {dep.notes && (
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 20 }}>
                              Note: {dep.notes}
                            </Text>
                          )}
                        </Space>
                      </List.Item>
                    )
                  }}
                  bordered={false}
                  style={{ background: 'var(--color-fill-1)', borderRadius: 4, padding: 8 }}
                />
              </Collapse.Item>
            </Collapse>
          </>
        )}

        <Divider style={{ margin: '8px 0' }} />

        {/* Tasks */}
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title heading={6} style={{ margin: 0 }}>
            Tasks & Workflows
          </Title>
          <Space>
            <Button
              icon={<IconLink />}
              size="small"
              onClick={() => setAddDepModalVisible(true)}
            >
              Add Dependency
            </Button>
            <Button
              type="primary"
              icon={<IconPlus />}
              size="small"
              onClick={() => setAddTaskModalVisible(true)}
            >
              Add Task
            </Button>
          </Space>
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
              const taskStepDeps = getDepsForTask(task.id)
              const hasBlockingDeps = taskStepDeps.some(
                (d) => d.isHardBlock && d.blockingStepStatus !== StepStatus.Completed,
              )

              return (
                <List.Item
                  key={item.id}
                  actions={[
                    task.hasSteps && (
                      <Tooltip key="add-dep" content="Add dependency">
                        <Button
                          type="text"
                          size="small"
                          icon={<IconLink />}
                          onClick={() => handleAddDependencyForTask(task.id)}
                        />
                      </Tooltip>
                    ),
                    <Button
                      key="remove"
                      type="text"
                      status="danger"
                      size="small"
                      icon={<IconDelete />}
                      onClick={() => handleRemoveTask(task.id)}
                    />,
                  ].filter(Boolean)}
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
                        {hasBlockingDeps && (
                          <Tag icon={<IconLock />} size="small" color="red">
                            Blocked
                          </Tag>
                        )}
                        {taskStepDeps.length > 0 && !hasBlockingDeps && (
                          <Tag icon={<IconCheck />} size="small" color="green">
                            {taskStepDeps.length} dep{taskStepDeps.length > 1 ? 's' : ''} satisfied
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

      {/* Add Dependency Modal */}
      <AddDependencyModal
        visible={addDepModalVisible}
        onClose={handleDependencyModalClose}
        endeavorId={endeavorId}
        preselectedBlockedTaskId={addDepForTaskId}
      />
    </Card>
  )
}
