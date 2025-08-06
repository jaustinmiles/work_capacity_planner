import React, { useState, useEffect } from 'react'
import { Layout, Menu, Typography, ConfigProvider, Button, Space, Badge, Dropdown, Spin, Alert, Message, Popconfirm } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconPlus, IconDown, IconBranch, IconSchedule, IconBulb, IconDelete } from '@arco-design/web-react/icon'
import enUS from '@arco-design/web-react/es/locale/en-US'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { GanttChart } from './components/timeline/GanttChart'
import { BrainstormModal } from './components/ai/BrainstormModal'
import { TaskCreationFlow } from './components/ai/TaskCreationFlow'
import { useTaskStore } from './store/useTaskStore'
import { exampleSequencedTask } from '@shared/sequencing-types'
import { getDatabase } from './services/database'

const { Header, Sider, Content } = Layout
const { Title } = Typography
const MenuItem = Menu.Item

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: 'focused' | 'admin'
  needsMoreInfo?: boolean
}

function App() {
  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar' | 'workflows' | 'timeline'>('tasks')
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [brainstormModalVisible, setBrainstormModalVisible] = useState(false)
  const [taskCreationFlowVisible, setTaskCreationFlowVisible] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [showExampleWorkflow, setShowExampleWorkflow] = useState(false)
  const {
    tasks,
    sequencedTasks,
    addTask,
    addSequencedTask,
    deleteSequencedTask,
    currentWeeklySchedule,
    isScheduling,
    generateWeeklySchedule,
    initializeData,
    isLoading,
    error,
  } = useTaskStore()

  const incompleteTasks = tasks.filter(task => !task.completed).length

  // Initialize data when app starts
  useEffect(() => {
    initializeData()
  }, [initializeData])

  // Generate weekly schedule when timeline view is accessed
  useEffect(() => {
    if (activeView === 'timeline' && !currentWeeklySchedule && !isScheduling) {
      const today = new Date()
      const monday = new Date(today)
      monday.setDate(today.getDate() - today.getDay() + 1) // Get Monday of current week
      generateWeeklySchedule(monday)
    }
  }, [activeView, currentWeeklySchedule, isScheduling, generateWeeklySchedule])

  const handleTasksExtracted = (tasks: ExtractedTask[]) => {
    setExtractedTasks(tasks)
    setBrainstormModalVisible(false)
    setTaskCreationFlowVisible(true)
  }

  const handleWorkflowsExtracted = async (workflows: any[], standaloneTasks: ExtractedTask[]) => {
    try {
      // Create workflows
      for (const workflow of workflows) {
        // Combine description and notes
        const combinedNotes = workflow.description
          ? `${workflow.description}${workflow.notes ? '\n\n' + workflow.notes : ''}`
          : workflow.notes || ''

        const sequencedTask = {
          name: workflow.name,
          importance: workflow.importance,
          urgency: workflow.urgency,
          type: workflow.type,
          notes: combinedNotes,
          dependencies: [],
          completed: false,
          totalDuration: workflow.totalDuration,
          criticalPathDuration: workflow.totalDuration, // Will be calculated properly
          worstCaseDuration: workflow.totalDuration * 1.5, // Estimate
          overallStatus: 'not_started' as const,
          steps: workflow.steps.map((step: any, index: number) => ({
            ...step,
            id: `step-${index}`,
            status: 'pending' as const,
            stepIndex: index,
          })),
        }
        await addSequencedTask(sequencedTask)
      }

      // Create standalone tasks
      for (const task of standaloneTasks) {
        await addTask({
          name: task.name,
          duration: task.estimatedDuration,
          importance: task.importance,
          urgency: task.urgency,
          type: task.type,
          asyncWaitTime: 0,
          dependencies: [],
          completed: false,
          notes: task.description,
        })
      }

      // Show success message
      Message.success(`Created ${workflows.length} workflows and ${standaloneTasks.length} tasks`)

      // Close modal
      setBrainstormModalVisible(false)

      // Switch to workflows view if workflows were created
      if (workflows.length > 0) {
        setActiveView('workflows')
      }
    } catch (error) {
      console.error('Error creating workflows:', error)
      Message.error('Failed to create workflows and tasks')
    }
  }

  const handleTaskCreationComplete = () => {
    setTaskCreationFlowVisible(false)
    setExtractedTasks([])
  }

  const handleDeleteSequencedTask = async (taskId: string) => {
    try {
      await deleteSequencedTask(taskId)
      Message.success('Workflow deleted successfully')
    } catch (error) {
      console.error('Error deleting workflow:', error)
      Message.error('Failed to delete workflow')
    }
  }

  const handleDeleteAllSequencedTasks = async () => {
    try {
      await getDatabase().deleteAllSequencedTasks()
      await initializeData() // Reload all data
      Message.success('All workflows deleted successfully')
    } catch (error) {
      console.error('Error deleting all workflows:', error)
      Message.error('Failed to delete all workflows')
    }
  }

  return (
    <ConfigProvider
      locale={enUS}
      theme={{
        primaryColor: '#165DFF',
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          width={240}
          style={{
            background: '#fff',
            boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{
            padding: '24px 20px',
            borderBottom: '1px solid #E5E8EF',
          }}>
            <Title heading={4} style={{ margin: 0, color: '#1D2129' }}>
              Work Capacity Planner
            </Title>
          </div>

          <Menu
            selectedKeys={[activeView]}
            onClickMenuItem={(key) => setActiveView(key as any)}
            style={{ marginTop: 20 }}
          >
            <MenuItem key="tasks">
              <Space>
                <IconList />
                <span>Task List</span>
                {incompleteTasks > 0 && (
                  <Badge count={incompleteTasks} dot offset={[6, -4]} />
                )}
              </Space>
            </MenuItem>
            <MenuItem key="matrix">
              <Space>
                <IconApps />
                <span>Eisenhower Matrix</span>
              </Space>
            </MenuItem>
            <MenuItem key="calendar">
              <Space>
                <IconCalendar />
                <span>Calendar</span>
              </Space>
            </MenuItem>
            <MenuItem key="workflows">
              <Space>
                <IconBranch />
                <span>Workflows</span>
              </Space>
            </MenuItem>
            <MenuItem key="timeline">
              <Space>
                <IconSchedule />
                <span>Timeline</span>
              </Space>
            </MenuItem>
          </Menu>

          <div style={{
            position: 'absolute',
            bottom: 24,
            left: 20,
            right: 20,
          }}>
            <Dropdown
              trigger="click"
              droplist={
                <div style={{ padding: 8 }}>
                  <Button
                    type="text"
                    icon={<IconBulb />}
                    onClick={() => setBrainstormModalVisible(true)}
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
                  >
                    AI Brainstorm
                  </Button>
                  <Button
                    type="text"
                    icon={<IconPlus />}
                    onClick={() => setTaskFormVisible(true)}
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
                  >
                    Simple Task
                  </Button>
                  <Button
                    type="text"
                    icon={<IconBranch />}
                    onClick={() => setSequencedTaskFormVisible(true)}
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    Sequenced Workflow
                  </Button>
                </div>
              }
            >
              <Button
                type="primary"
                size="large"
                icon={<IconPlus />}
                long
                style={{
                  boxShadow: '0 4px 10px rgba(22, 93, 255, 0.2)',
                  fontWeight: 500,
                }}
              >
                Add Task <IconDown style={{ marginLeft: 8 }} />
              </Button>
            </Dropdown>
          </div>
        </Sider>

        <Layout>
          <Header style={{
            background: '#FAFBFC',
            borderBottom: '1px solid #E5E8EF',
            padding: '0 24px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Title heading={5} style={{ margin: 0, color: '#4E5969' }}>
              {activeView === 'tasks' && 'Task Management'}
              {activeView === 'matrix' && 'Priority Matrix'}
              {activeView === 'calendar' && 'Schedule Overview'}
              {activeView === 'workflows' && 'Sequenced Workflows'}
              {activeView === 'timeline' && 'Gantt Chart'}
            </Title>
          </Header>

          <Content style={{
            padding: 24,
            background: '#F7F8FA',
            overflow: 'auto',
          }}>
            {error && (
              <Alert
                type="error"
                title="Error"
                content={error}
                style={{ marginBottom: 16, maxWidth: 1200, margin: '0 auto 16px auto' }}
                showIcon
              />
            )}

            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Spin size={40} />
                  <div style={{ marginTop: 16 }}>
                    <Typography.Text type="secondary">Loading data...</Typography.Text>
                  </div>
                </div>
              ) : (
                <>
              {activeView === 'tasks' && (
                <TaskList onAddTask={() => setTaskFormVisible(true)} />
              )}

              {activeView === 'matrix' && (
                <EisenhowerMatrix onAddTask={() => setTaskFormVisible(true)} />
              )}

              {activeView === 'calendar' && (
                <WeeklyCalendar />
              )}

              {activeView === 'workflows' && (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* User's Created Workflows */}
                  {sequencedTasks.length > 0 && (
                    <>
                      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography.Title heading={5}>Your Workflows ({sequencedTasks.length})</Typography.Title>
                        {process.env.NODE_ENV === 'development' && sequencedTasks.length > 0 && (
                          <Popconfirm
                            title="Delete All Workflows?"
                            content="This will permanently delete all workflows and their steps. This action cannot be undone."
                            onOk={handleDeleteAllSequencedTasks}
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
                              Delete All Workflows
                            </Button>
                          </Popconfirm>
                        )}
                      </div>

                      {sequencedTasks.map(task => (
                        <SequencedTaskView
                          key={task.id}
                          task={task}
                          onStartWorkflow={() => {/* Future: Implement workflow execution tracking */}}
                          onPauseWorkflow={() => {/* Future: Implement workflow pause functionality */}}
                          onResetWorkflow={() => {/* Future: Implement workflow reset to initial state */}}
                          onDelete={() => handleDeleteSequencedTask(task.id)}
                        />
                      ))}
                    </>
                  )}

                  {/* Example Workflow */}
                  <Button
                    type="primary"
                    onClick={() => setShowExampleWorkflow(!showExampleWorkflow)}
                  >
                    {showExampleWorkflow ? 'Hide' : 'Show'} Example Workflow
                  </Button>

                  {showExampleWorkflow && (
                    <SequencedTaskView
                      task={exampleSequencedTask}
                      onStartWorkflow={() => {/* Future: Implement workflow execution tracking */}}
                      onPauseWorkflow={() => {/* Future: Implement workflow pause functionality */}}
                      onResetWorkflow={() => {/* Future: Implement workflow reset to initial state */}}
                    />
                  )}
                </Space>
              )}

              {activeView === 'timeline' && (
                <GanttChart
                  tasks={tasks}
                  sequencedTasks={sequencedTasks}
                />
              )}
                </>
              )}
            </div>
          </Content>
        </Layout>

        <TaskForm
          visible={taskFormVisible}
          onClose={() => setTaskFormVisible(false)}
        />

        <SequencedTaskForm
          visible={sequencedTaskFormVisible}
          onClose={() => setSequencedTaskFormVisible(false)}
          onSubmit={async (taskData) => {
            // Task successfully created and added to store
            await addSequencedTask(taskData)
          }}
        />

        <BrainstormModal
          visible={brainstormModalVisible}
          onClose={() => setBrainstormModalVisible(false)}
          onTasksExtracted={handleTasksExtracted}
          onWorkflowsExtracted={handleWorkflowsExtracted}
        />

        <TaskCreationFlow
          visible={taskCreationFlowVisible}
          onClose={handleTaskCreationComplete}
          extractedTasks={extractedTasks}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App
