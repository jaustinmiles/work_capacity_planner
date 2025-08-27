import { Card, List, Typography, Empty, Space, Tag, Button, Progress, Popconfirm } from '@arco-design/web-react'
import { IconPlus, IconCheckCircle, IconClockCircle, IconDelete, IconCalendarClock } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskItem } from './TaskItem'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { useState } from 'react'
import { ScheduleGenerator } from '../schedule/ScheduleGenerator'
import { logger } from '../../utils/logger'
import { useLoggerContext } from '../../../logging/index.renderer'
import { RendererLogger } from '../../../logging/renderer/RendererLogger'


const { Title, Text } = Typography

interface TaskListProps {
  onAddTask: () => void
}

export function TaskList({ onAddTask }: TaskListProps) {
  const { tasks, loadTasks, sequencedTasks } = useTaskStore()
  const [scheduleGeneratorVisible, setScheduleGeneratorVisible] = useState(false)
  const { logger: newLogger } = useLoggerContext()
  const rendererLogger = newLogger as RendererLogger

  const incompleteTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)

  const handleDeleteAllTasks = async () => {
    rendererLogger.interaction('Delete All Tasks Confirmed', {
      component: 'TaskList',
      taskCount: tasks.length,
    })
    try {
      await getDatabase().deleteAllTasks()
      await loadTasks() // Reload tasks to update UI
      Message.success('All tasks deleted successfully')
      newLogger.info('[TaskList] All tasks deleted', { previousCount: tasks.length })
    } catch (error) {
      logger.ui.error('Error deleting all tasks:', error)
      newLogger.error('[TaskList] Failed to delete all tasks', error as Error)
      Message.error('Failed to delete all tasks')
    }
  }

  const handleScheduleAccepted = async () => {
    // Reload tasks to reflect any changes
    await loadTasks()
  }

  // Sort incomplete tasks by priority (importance * urgency)
  const sortedIncompleteTasks = [...incompleteTasks].sort((a, b) => {
    const priorityA = a.importance * a.urgency
    const priorityB = b.importance * b.urgency
    return priorityB - priorityA
  })

  // Calculate progress
  const totalTasks = tasks.length
  const completionRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Summary Card */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Title heading={6} style={{ margin: 0 }}>Task Overview</Title>
            <Tag color="blue">
              <IconClockCircle /> {incompleteTasks.length} Active
            </Tag>
            <Tag color="green">
              <IconCheckCircle /> {completedTasks.length} Completed
            </Tag>
          </Space>
          <Progress
            percent={completionRate}
            style={{ width: 200 }}
            formatText={(percent) => `${Math.round(percent)}% Complete`}
          />
        </Space>
      </Card>

      {/* Active Tasks */}
      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Title heading={5} style={{ margin: 0 }}>
              Active Tasks
            </Title>
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<IconCalendarClock />}
                onClick={() => {
                  rendererLogger.interaction('Generate Schedule clicked', {
                    component: 'TaskList',
                    incompleteTaskCount: incompleteTasks.length,
                  })
                  setScheduleGeneratorVisible(true)
                }}
                disabled={incompleteTasks.length === 0}
              >
                Generate Schedule
              </Button>
              <Button
                type="text"
                size="small"
                icon={<IconPlus />}
                onClick={() => {
                  rendererLogger.interaction('Add Task clicked', {
                    component: 'TaskList',
                    currentTaskCount: tasks.length,
                  })
                  onAddTask()
                }}
              >
                Add Task
              </Button>
              {process.env.NODE_ENV === 'development' && tasks.length > 0 && (
                <Popconfirm
                  title="Delete All Tasks?"
                  content="This will permanently delete all tasks. This action cannot be undone."
                  onOk={handleDeleteAllTasks}
                  okText="Delete All"
                  cancelText="Cancel"
                  okButtonProps={{ status: 'danger' }}
                >
                  <Button
                    type="text"
                    size="small"
                    status="danger"
                    icon={<IconDelete />}
                  >
                    Delete All
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        }
      >
        {sortedIncompleteTasks.length === 0 ? (
          <Empty
            description={
              <Space direction="vertical">
                <Text type="secondary">No active tasks</Text>
                <Button
                  type="primary"
                  icon={<IconPlus />}
                  onClick={() => {
                    rendererLogger.interaction('Create First Task clicked', {
                      component: 'TaskList',
                      isEmpty: true,
                    })
                    onAddTask()
                  }}
                >
                  Create Your First Task
                </Button>
              </Space>
            }
          />
        ) : (
          <List
            dataSource={sortedIncompleteTasks}
            render={(task) => (
              <List.Item key={task.id}>
                <TaskItem task={task} />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <Card
          title={
            <Title heading={5} style={{ margin: 0, color: '#86909C' }}>
              Completed Tasks
            </Title>
          }
          style={{ opacity: 0.8 }}
        >
          <List
            dataSource={completedTasks}
            render={(task) => (
              <List.Item key={task.id}>
                <TaskItem task={task} />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Schedule Generator Modal */}
      <ScheduleGenerator
        visible={scheduleGeneratorVisible}
        onClose={() => setScheduleGeneratorVisible(false)}
        tasks={tasks}
        sequencedTasks={sequencedTasks || []}
        onScheduleAccepted={handleScheduleAccepted}
      />
    </Space>
  )
}
