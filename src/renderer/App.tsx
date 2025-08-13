import { useState, useEffect } from 'react'
import { Layout, Menu, Typography, ConfigProvider, Button, Space, Badge, Dropdown, Spin, Alert, Popconfirm } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconPlus, IconDown, IconBranch, IconSchedule, IconBulb, IconDelete, IconUserGroup } from '@arco-design/web-react/icon'
import enUS from '@arco-design/web-react/es/locale/en-US'
import { Message } from './components/common/Message'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { TestWorkflowCreator } from './components/tasks/TestWorkflowCreator'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { GanttChart } from './components/timeline/GanttChart'
import { BrainstormModal } from './components/ai/BrainstormModal'
import { TaskCreationFlow } from './components/ai/TaskCreationFlow'
import { WorkStatusWidget } from './components/status/WorkStatusWidget'
import { WorkScheduleModal } from './components/settings/WorkScheduleModal'
import { SessionManager } from './components/session/SessionManager'
import { DevTools } from './components/dev/DevTools'
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
  const [showWorkSchedule, setShowWorkSchedule] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const {
    tasks,
    sequencedTasks,
    addTask,
    addSequencedTask,
    updateSequencedTask,
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
    console.log('App: Starting initialization...')
    initializeData()
  }, [initializeData])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + D for DevTools
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setShowDevTools(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
          duration: workflow.duration,
          asyncWaitTime: 0,
          sessionId: '',  // Will be set by database
          hasSteps: true,
          criticalPathDuration: workflow.duration, // Will be calculated properly
          worstCaseDuration: workflow.duration * 1.5, // Estimate
          overallStatus: 'not_started' as const,
          steps: workflow.steps.map((step: any, index: number) => ({
            ...step,
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
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
          sessionId: '',  // Will be set by database
          hasSteps: false,
          overallStatus: 'not_started' as const,
          criticalPathDuration: task.estimatedDuration,
          worstCaseDuration: task.estimatedDuration,
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

  const handleStartWorkflow = async (id: string) => {
    try {
      // Find the workflow
      const workflow = sequencedTasks.find(st => st.id === id)
      if (!workflow) return

      // Update the workflow status to in_progress and set the first step as current
      const firstPendingStep = workflow.steps.find(step => step.status === 'pending')
      if (!firstPendingStep) {
        Message.warning('No pending steps in this workflow')
        return
      }

      await updateSequencedTask(id, {
        overallStatus: 'in_progress',
        currentStepId: firstPendingStep.id,
        steps: workflow.steps.map(step =>
          step.id === firstPendingStep.id
            ? { ...step, status: 'in_progress' }
            : step,
        ),
      })

      Message.success('Workflow started successfully')
    } catch (error) {
      console.error('Failed to start workflow:', error)
      Message.error('Failed to start workflow')
    }
  }

  const handlePauseWorkflow = async (id: string) => {
    try {
      const workflow = sequencedTasks.find(st => st.id === id)
      if (!workflow) return

      // Find the current in-progress step and pause it
      const updatedSteps = workflow.steps.map(step =>
        step.status === 'in_progress'
          ? { ...step, status: 'pending' as const }
          : step,
      )

      await updateSequencedTask(id, {
        overallStatus: 'not_started',
        currentStepId: null as any,
        steps: updatedSteps,
      })

      Message.success('Workflow paused')
    } catch (error) {
      console.error('Failed to pause workflow:', error)
      Message.error('Failed to pause workflow')
    }
  }

  const handleResetWorkflow = async (id: string) => {
    try {
      const workflow = sequencedTasks.find(st => st.id === id)
      if (!workflow) return

      // Reset all steps to pending
      const resetSteps = workflow.steps.map(step => ({
        id: step.id,
        taskId: step.taskId,
        name: step.name,
        duration: step.duration,
        type: step.type,
        dependsOn: step.dependsOn,
        asyncWaitTime: step.asyncWaitTime,
        stepIndex: step.stepIndex,
        percentComplete: 0,
        status: 'pending' as const,
        completedAt: null as any,
        actualDuration: null as any,
        startedAt: null as any,
      }))

      await updateSequencedTask(id, {
        overallStatus: 'not_started',
        currentStepId: null,
        steps: resetSteps,
      })

      Message.success('Workflow reset to initial state')
    } catch (error) {
      console.error('Failed to reset workflow:', error)
      Message.error('Failed to reset workflow')
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

          {/* Work Status Widget */}
          <div style={{ padding: '20px 16px' }}>
            <WorkStatusWidget onEditSchedule={() => setShowWorkSchedule(true)} />
          </div>

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

            <Space>
              <Button
                type="text"
                icon={<IconUserGroup />}
                onClick={() => setShowSessionManager(true)}
              >
                Sessions
              </Button>
            </Space>
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
                <ErrorBoundary>
                  <TaskList onAddTask={() => setTaskFormVisible(true)} />
                </ErrorBoundary>
              )}

              {activeView === 'matrix' && (
                <ErrorBoundary>
                  <EisenhowerMatrix onAddTask={() => setTaskFormVisible(true)} />
                </ErrorBoundary>
              )}

              {activeView === 'calendar' && (
                <ErrorBoundary>
                  <WeeklyCalendar />
                </ErrorBoundary>
              )}

              {activeView === 'workflows' && (
                <ErrorBoundary>
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
                        {process.env.NODE_ENV === 'development' && <TestWorkflowCreator />}
                      </div>

                      {sequencedTasks
                        .sort((a, b) => {
                          // Sort by priority (importance * urgency) descending
                          const priorityA = a.importance * a.urgency
                          const priorityB = b.importance * b.urgency
                          return priorityB - priorityA
                        })
                        .map(task => (
                        <SequencedTaskView
                          key={task.id}
                          task={task}
                          onStartWorkflow={() => handleStartWorkflow(task.id)}
                          onPauseWorkflow={() => handlePauseWorkflow(task.id)}
                          onResetWorkflow={() => handleResetWorkflow(task.id)}
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
                      onStartWorkflow={() => Message.info('This is just an example workflow')}
                      onPauseWorkflow={() => Message.info('This is just an example workflow')}
                      onResetWorkflow={() => Message.info('This is just an example workflow')}
                    />
                  )}
                </Space>
                </ErrorBoundary>
              )}

              {activeView === 'timeline' && (
                <ErrorBoundary>
                  <GanttChart
                    tasks={tasks}
                    sequencedTasks={sequencedTasks}
                  />
                </ErrorBoundary>
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

        <WorkScheduleModal
          visible={showWorkSchedule}
          onClose={() => setShowWorkSchedule(false)}
          onSave={() => {
            // Refresh any data if needed
            setShowWorkSchedule(false)
          }}
        />

        <SessionManager
          visible={showSessionManager}
          onClose={() => setShowSessionManager(false)}
          onSessionChange={() => {
            // Reload data when session changes
            initializeData()
          }}
        />
        <DevTools
          visible={showDevTools}
          onClose={() => setShowDevTools(false)}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App
