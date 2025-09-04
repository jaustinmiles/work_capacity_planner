import { Card, List, Typography, Empty, Space, Tag, Button, Progress, Popconfirm, Select, Radio, Pagination } from '@arco-design/web-react'
import { IconPlus, IconCheckCircle, IconClockCircle, IconDelete, IconCalendarClock, IconEdit, IconFilter, IconList, IconApps } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskItem } from './TaskItem'
import { TaskGridView } from './TaskGridView'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { useState } from 'react'
import { ScheduleGenerator } from '../schedule/ScheduleGenerator'
import { TaskQuickEditModal } from './TaskQuickEditModal'
import { logger } from '../../utils/logger'
import { useLoggerContext } from '../../../logging/index.renderer'
import { RendererLogger } from '../../../logging/renderer/RendererLogger'
import { TaskType } from '@shared/enums'


const { Title, Text } = Typography

interface TaskListProps {
  onAddTask: () => void
}

export function TaskList({ onAddTask }: TaskListProps) {
  const { tasks, loadTasks, sequencedTasks } = useTaskStore()
  const [scheduleGeneratorVisible, setScheduleGeneratorVisible] = useState(false)
  const [quickEditVisible, setQuickEditVisible] = useState(false)
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskType | 'all' | 'work'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20) // Show 20 tasks per page
  const { logger: newLogger } = useLoggerContext()
  const rendererLogger = newLogger as RendererLogger

  // Apply task type filter
  const filteredTasks = taskTypeFilter === 'all'
    ? tasks
    : taskTypeFilter === 'work'
    ? tasks.filter(task => task.type === TaskType.Focused || task.type === TaskType.Admin)
    : tasks.filter(task => task.type === taskTypeFilter)

  const incompleteTasks = filteredTasks.filter(task => !task.completed)
  const completedTasks = filteredTasks.filter(task => task.completed)

  // Apply pagination
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedIncompleteTasks = incompleteTasks.slice(startIndex, endIndex)
  const paginatedCompletedTasks = completedTasks.slice(0, 5) // Always show just 5 completed tasks

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
  const sortedIncompleteTasks = [...paginatedIncompleteTasks].sort((a, b) => {
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

      {/* Filters and View Mode */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space style={{ alignItems: 'center' }}>
            <IconFilter style={{ fontSize: 16 }} />
            <Text>Filter by Type:</Text>
            <Select
              value={taskTypeFilter}
              onChange={(value) => {
                setTaskTypeFilter(value)
                setCurrentPage(1) // Reset to first page when changing filter
                rendererLogger.interaction('Task Type Filter Changed', {
                  component: 'TaskList',
                  filterType: value,
                })
              }}
              style={{ width: 200 }}
              placeholder="Select task type"
            >
              <Select.Option value="all">All Tasks</Select.Option>
              <Select.Option value="work">Work Items (Focused + Admin)</Select.Option>
              <Select.Option value={TaskType.Focused}>Focused Tasks</Select.Option>
              <Select.Option value={TaskType.Admin}>Admin Tasks</Select.Option>
              <Select.Option value={TaskType.Personal}>Personal Tasks</Select.Option>
            </Select>
            {taskTypeFilter !== 'all' && (
              <Text type="secondary">
                Showing {filteredTasks.length} of {tasks.length} tasks
              </Text>
            )}
          </Space>
          <Radio.Group
            type="button"
            value={viewMode}
            onChange={(value) => {
              setViewMode(value)
              rendererLogger.interaction('View Mode Changed', {
                component: 'TaskList',
                viewMode: value,
              })
            }}
          >
            <Radio value="list">
              <IconList /> List
            </Radio>
            <Radio value="grid">
              <IconApps /> Grid
            </Radio>
          </Radio.Group>
        </Space>
      </Card>

      {/* Active Tasks */}
      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Title heading={5} style={{ margin: 0 }}>
              Active Tasks {taskTypeFilter !== 'all' && `(${taskTypeFilter === 'work' ? 'Work Items' : taskTypeFilter})`}
            </Title>
            <Space>
              <Button
                size="small"
                icon={<IconEdit />}
                onClick={() => {
                  rendererLogger.interaction('Quick Edit clicked', {
                    component: 'TaskList',
                    taskCount: incompleteTasks.length,
                  })
                  setQuickEditVisible(true)
                }}
              >
                Quick Edit
              </Button>
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
        ) : viewMode === 'list' ? (
          <List
            dataSource={sortedIncompleteTasks}
            render={(task) => (
              <List.Item key={task.id}>
                <TaskItem task={task} />
              </List.Item>
            )}
          />
        ) : (
          <TaskGridView tasks={sortedIncompleteTasks} />
        )}
      </Card>

      {/* Pagination */}
      {incompleteTasks.length > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <Pagination
            current={currentPage}
            total={incompleteTasks.length}
            pageSize={pageSize}
            onChange={setCurrentPage}
            showTotal
            sizeOptions={[10, 20, 30, 50]}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setCurrentPage(1) // Reset to first page when changing page size
            }}
            showJumper
          />
        </div>
      )}

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
            dataSource={paginatedCompletedTasks}
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

      {/* Quick Edit Modal */}
      <TaskQuickEditModal
        visible={quickEditVisible}
        onClose={() => setQuickEditVisible(false)}
        filter="incomplete"
      />
    </Space>
  )
}
