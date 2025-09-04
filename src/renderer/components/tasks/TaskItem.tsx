import { useState, useEffect } from 'react'
import { TaskType } from '@shared/enums'
import { Space, Typography, Tag, Checkbox, Button, Input, Popconfirm, Tooltip, Modal } from '@arco-design/web-react'
import { IconEdit, IconDelete, IconClockCircle, IconCalendar, IconExclamationCircle, IconCheckCircleFill, IconMindMapping } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'
import { UnifiedTaskEdit } from './UnifiedTaskEdit'
import { TaskTimeLoggingModal } from './TaskTimeLoggingModal'
import { WorkSessionsModal } from './WorkSessionsModal'
import { WorkflowProgressTracker } from '../progress/WorkflowProgressTracker'
import { getDatabase } from '../../services/database'
import { SequencedTask } from '@shared/sequencing-types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { logger } from '../../utils/logger'
import { useLoggerContext } from '../../../logging/index.renderer'
import { RendererLogger } from '../../../logging/renderer/RendererLogger'


dayjs.extend(relativeTime)

const { Text } = Typography

interface TaskItemProps {
  task: Task
}

export function TaskItem({ task }: TaskItemProps) {
  const { toggleTaskComplete, deleteTask, selectTask, updateTask } = useTaskStore()
  const { logger: newLogger } = useLoggerContext()
  const rendererLogger = newLogger as RendererLogger
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(task.name)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [loggedTime, setLoggedTime] = useState<number>(0)

  useEffect(() => {
    // Fetch logged time for this task
    getDatabase().getTaskTotalLoggedTime(task.id).then(time => {
      setLoggedTime(time)
    }).catch(err => {
      logger.ui.error('Failed to fetch logged time:', err)
    })
  }, [task.id, task.actualDuration]) // Re-fetch when actualDuration changes

  const priorityScore = task.importance * task.urgency
  const priorityColor = priorityScore >= 64 ? 'red' :
                       priorityScore >= 36 ? 'orange' :
                       'green'

  const priorityStatus = priorityScore >= 64 ? 'High Priority' :
                        priorityScore >= 36 ? 'Medium Priority' :
                        'Low Priority'

  const handleSave = async () => {
    if (editedName.trim()) {
      try {
        logger.ui.info('Task name updated', {
          taskId: task.id,
          oldName: task.name,
          newName: editedName.trim(),
        })
        await updateTask(task.id, { name: editedName.trim() })
        setIsEditing(false)
      } catch (__error) {
        // Error already handled by store
      }
    }
  }

  const handleCancel = () => {
    setEditedName(task.name)
    setIsEditing(false)
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  return (
    <div
      style={{
        padding: '16px',
        background: task.completed ? '#F7F8FA' : '#fff',
        borderRadius: '8px',
        border: '1px solid #E5E8EF',
        transition: 'all 0.2s',
        opacity: task.completed ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!task.completed) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
          e.currentTarget.style.borderColor = '#C9CDD4'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = '#E5E8EF'
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <Space align="start">
          <Checkbox
            checked={task.completed}
            onChange={() => {
              rendererLogger.interaction('Task checkbox clicked', {
                component: 'TaskItem',
                taskId: task.id,
                taskName: task.name,
                newCompletedState: !task.completed,
              })
              logger.ui.info('Task completion toggled', {
                taskId: task.id,
                taskName: task.name,
                completed: !task.completed,
              })
              toggleTaskComplete(task.id).catch(console.error)
            }}
            style={{ marginTop: 2 }}
          />

          <div style={{ flex: 1 }}>
            {isEditing ? (
              <Space>
                <Input
                  value={editedName}
                  onChange={setEditedName}
                  onPressEnter={handleSave}
                  style={{ width: 300 }}
                  autoFocus
                />
                <Button type="primary" size="small" onClick={handleSave}>
                  Save
                </Button>
                <Button size="small" onClick={handleCancel}>
                  Cancel
                </Button>
              </Space>
            ) : (
              <>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: task.completed ? 'line-through' : 'none',
                  }}
                  onClick={() => {
                    rendererLogger.interaction('Task name clicked', {
                      component: 'TaskItem',
                      taskId: task.id,
                      taskName: task.name,
                    })
                    logger.ui.debug('Task selected', { taskId: task.id, taskName: task.name })
                    selectTask(task.id)
                  }}
                  className="hover:text-blue-600"
                >
                  {task.name}
                </Text>

                <div style={{ marginTop: 8 }}>
                  <Space size="medium" wrap>
                    <Tag
                      icon={<IconClockCircle />}
                      color="arcoblue"
                      size="small"
                    >
                      Est: {formatDuration(task.duration)}
                    </Tag>

                    {loggedTime > 0 && (
                      <Tag
                        icon={<IconCheckCircleFill />}
                        color={loggedTime > task.duration ? 'orange' : 'green'}
                        size="small"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          logger.ui.debug('Work sessions modal opened', { taskId: task.id })
                          setShowSessionsModal(true)
                        }}
                      >
                        Logged: {formatDuration(loggedTime)}
                      </Tag>
                    )}

                    <Tooltip content={`Importance: ${task.importance}, Urgency: ${task.urgency}`}>
                      <Tag
                        icon={<IconExclamationCircle />}
                        color={priorityColor}
                        size="small"
                      >
                        {priorityStatus} ({priorityScore})
                      </Tag>
                    </Tooltip>

                    <Tooltip content="Cognitive Complexity (1=Low, 5=High)">
                      <Tag
                        icon={<IconMindMapping />}
                        color={(task.cognitiveComplexity || 3) >= 4 ? 'red' :
                              (task.cognitiveComplexity || 3) >= 3 ? 'orange' :
                              'green'}
                        size="small"
                      >
                        Complexity: {task.cognitiveComplexity || 3}/5
                      </Tag>
                    </Tooltip>

                    <Tag size="small" color="gray">
                      {task.type === TaskType.Focused ? 'Focused Work' :
                       task.type === TaskType.Personal ? 'Personal' : 'Admin/Meeting'}
                    </Tag>

                    {task.asyncWaitTime > 0 && (
                      <Tag
                        icon={<IconCalendar />}
                        color="orange"
                        size="small"
                      >
                        Wait: {formatDuration(task.asyncWaitTime)}
                      </Tag>
                    )}

                    {task.deadline && (
                      <Tooltip content={`Due: ${dayjs(task.deadline).format('MMM D, YYYY h:mm A')}`}>
                        <Tag
                          icon={<IconCalendar />}
                          color={dayjs(task.deadline).isBefore(dayjs()) ? 'red' :
                                 dayjs(task.deadline).isBefore(dayjs().add(1, 'day')) ? 'orange' : 'blue'}
                          size="small"
                        >
                          Due {dayjs(task.deadline).fromNow()}
                        </Tag>
                      </Tooltip>
                    )}
                  </Space>
                </div>

                {task.notes && (
                  <Text
                    type="secondary"
                    style={{
                      display: 'block',
                      marginTop: 8,
                      fontSize: 14,
                    }}
                  >
                    {task.notes}
                  </Text>
                )}
              </>
            )}
          </div>
        </Space>

        <Space>
          {!task.completed && (
            <>
              <Tooltip content="Log time">
                <Button
                  type="text"
                  size="small"
                  icon={<IconClockCircle />}
                  onClick={() => {
                    rendererLogger.interaction('Time logging button clicked', {
                      component: 'TaskItem',
                      taskId: task.id,
                      taskName: task.name,
                      hasSteps: task.hasSteps,
                    })
                    logger.ui.info('Time logging modal opened', {
                      taskId: task.id,
                      taskName: task.name,
                      hasSteps: task.hasSteps,
                    })
                    // Use WorkflowProgressTracker for workflows, TaskTimeLoggingModal for regular tasks
                    if (task.hasSteps) {
                      setShowProgressModal(true)
                    } else {
                      setShowTimeModal(true)
                    }
                  }}
                />
              </Tooltip>

              <Tooltip content="Edit task">
                <Button
                  type="text"
                  size="small"
                  icon={<IconEdit />}
                  onClick={() => {
                    rendererLogger.interaction('Edit task button clicked', {
                      component: 'TaskItem',
                      taskId: task.id,
                      taskName: task.name,
                      hasSteps: task.hasSteps,
                    })
                    logger.ui.info('Task edit modal opened', {
                      taskId: task.id,
                      taskName: task.name,
                      hasSteps: task.hasSteps,
                    })
                    setShowEditModal(true)
                  }}
                />
              </Tooltip>
            </>
          )}

          <Popconfirm
            title="Delete Task"
            content="Are you sure you want to delete this task?"
            onOk={() => {
              rendererLogger.interaction('Delete task confirmed', {
                component: 'TaskItem',
                taskId: task.id,
                taskName: task.name,
              })
              logger.ui.warn('Task deleted', { taskId: task.id, taskName: task.name })
              deleteTask(task.id).catch(console.error)
            }}
            okText="Delete"
            okButtonProps={{ status: 'danger' }}
          >
            <Tooltip content="Delete task">
              <Button
                type="text"
                size="small"
                status="danger"
                icon={<IconDelete />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      </Space>

      {/* Edit Modal - Use appropriate editor based on task type */}
      <Modal
        title={task.hasSteps ? 'Edit Workflow' : 'Edit Task'}
        visible={showEditModal}
        onCancel={() => setShowEditModal(false)}
        footer={null}
        style={{ width: task.hasSteps ? 1000 : 800 }}
      >
        <UnifiedTaskEdit
          task={task.hasSteps ? {
            ...task,
            steps: task.steps || [],
            totalDuration: task.duration,
            overallStatus: task.overallStatus || 'not_started',
            criticalPathDuration: task.criticalPathDuration || task.duration,
            worstCaseDuration: task.worstCaseDuration || task.duration,
          } as SequencedTask : task}
          onClose={() => setShowEditModal(false)}
          startInEditMode={true}
        />
      </Modal>

      {/* Time Logging Modal */}
      <TaskTimeLoggingModal
        task={task}
        visible={showTimeModal}
        onClose={() => setShowTimeModal(false)}
      />

      <WorkSessionsModal
        taskId={task.id}
        taskName={task.name}
        visible={showSessionsModal}
        onClose={() => setShowSessionsModal(false)}
        onSessionsUpdated={() => {
          // Refresh logged time
          getDatabase().getTaskTotalLoggedTime(task.id).then(time => {
            setLoggedTime(time)
          })
        }}
      />

      {/* Workflow Progress Modal - for time logging on workflows */}
      {task.hasSteps && (
        <Modal
          title="Track Workflow Progress"
          visible={showProgressModal}
          onCancel={() => setShowProgressModal(false)}
          footer={null}
          style={{ width: 1000 }}
        >
          <WorkflowProgressTracker
            workflow={{
              ...task,
              steps: task.steps || [],
              totalDuration: task.duration,
              overallStatus: task.overallStatus || 'not_started',
              criticalPathDuration: task.criticalPathDuration || task.duration,
              worstCaseDuration: task.worstCaseDuration || task.duration,
            } as SequencedTask}
          />
        </Modal>
      )}
    </div>
  )
}
