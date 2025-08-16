import { Card, List, Typography, Empty, Space, Tag, Button, Progress, Popconfirm, Modal } from '@arco-design/web-react'
import { IconPlus, IconCheckCircle, IconClockCircle, IconDelete, IconCalendarClock } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskItem } from './TaskItem'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { useState } from 'react'
import { scheduleWithDeadlines, SchedulingContext } from '../../utils/deadline-scheduler'

const { Title, Text } = Typography

interface TaskListProps {
  onAddTask: () => void
}

export function TaskList({ onAddTask }: TaskListProps) {
  const { tasks, loadTasks, sequencedTasks } = useTaskStore()
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false)
  const [scheduleResults, setScheduleResults] = useState<any>(null)

  const incompleteTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)

  const handleDeleteAllTasks = async () => {
    try {
      await getDatabase().deleteAllTasks()
      await loadTasks() // Reload tasks to update UI
      Message.success('All tasks deleted successfully')
    } catch (error) {
      console.error('Error deleting all tasks:', error)
      Message.error('Failed to delete all tasks')
    }
  }

  const handleGenerateSchedule = async () => {
    try {
      // Create a scheduling context
      const context: SchedulingContext = {
        currentTime: new Date(),
        tasks: incompleteTasks,
        workflows: sequencedTasks || [],
        workPatterns: [],
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'default',
          sessionId: 'default',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 15,
          asyncParallelizationBonus: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
          },
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '18:00',
          },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)
      setScheduleResults(result)
      setScheduleModalVisible(true)

      // Show summary message
      if (result.failures.length > 0) {
        Message.warning(`Schedule generated with ${result.failures.length} deadline conflicts`)
      } else if (result.warnings.length > 0) {
        Message.info(`Schedule generated with ${result.warnings.length} warnings`)
      } else {
        Message.success('Schedule generated successfully!')
      }
    } catch (error) {
      console.error('Error generating schedule:', error)
      Message.error('Failed to generate schedule')
    }
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
                onClick={handleGenerateSchedule}
                disabled={incompleteTasks.length === 0}
              >
                Generate Schedule
              </Button>
              <Button
                type="text"
                size="small"
                icon={<IconPlus />}
                onClick={onAddTask}
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
                  onClick={onAddTask}
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

      {/* Schedule Results Modal */}
      <Modal
        title="Schedule Generation Results"
        visible={scheduleModalVisible}
        onCancel={() => setScheduleModalVisible(false)}
        footer={null}
        style={{ width: 700 }}
      >
        {scheduleResults && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {/* Show failures */}
            {scheduleResults.failures.length > 0 && (
              <Card title="⚠️ Deadline Conflicts" style={{ backgroundColor: '#fff2e8' }}>
                {scheduleResults.failures.map((failure: any, index: number) => (
                  <div key={index} style={{ marginBottom: 12 }}>
                    <Text type="error">{failure.message}</Text>
                    {failure.suggestions && (
                      <div style={{ marginTop: 8, marginLeft: 16 }}>
                        <Text type="secondary">Suggestions:</Text>
                        <ul>
                          {failure.suggestions.tasksToDropOrDefer?.length > 0 && (
                            <li>Consider deferring lower priority tasks</li>
                          )}
                          {failure.suggestions.minimumDeadlineExtension > 0 && (
                            <li>Extend deadline by at least {failure.suggestions.minimumDeadlineExtension} hours</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {/* Show warnings */}
            {scheduleResults.warnings.length > 0 && (
              <Card title="⚠️ Warnings" style={{ backgroundColor: '#fffbe8' }}>
                {scheduleResults.warnings.map((warning: any, index: number) => (
                  <div key={index} style={{ marginBottom: 8 }}>
                    <Text type="warning">{warning.message}</Text>
                    {warning.expectedDelay && (
                      <Text type="secondary"> (delay: {Math.round(warning.expectedDelay / 3600000)} hours)</Text>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {/* Show suggestions */}
            {scheduleResults.suggestions.length > 0 && (
              <Card title="💡 Optimization Suggestions">
                {scheduleResults.suggestions.map((suggestion: any, index: number) => (
                  <div key={index} style={{ marginBottom: 8 }}>
                    <Text strong>{suggestion.message}</Text>
                    <br />
                    <Text type="secondary">{suggestion.recommendation}</Text>
                  </div>
                ))}
              </Card>
            )}

            {/* Show schedule summary */}
            <Card title="📅 Schedule Summary">
              <Text>Generated {scheduleResults.schedule.length} scheduled items</Text>
              <br />
              <Text type="secondary">
                To view the full schedule, navigate to the Calendar or Gantt Chart view
              </Text>
            </Card>
          </Space>
        )}
      </Modal>
    </Space>
  )
}
