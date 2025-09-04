import { useState, useEffect } from 'react'
import { Layout, Menu, Typography, ConfigProvider, Button, Space, Badge, Dropdown, Spin, Alert, Popconfirm, Tooltip } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconPlus, IconDown, IconBranch, IconSchedule, IconBulb, IconDelete, IconUserGroup, IconSoundFill, IconClockCircle } from '@arco-design/web-react/icon'
import enUS from '@arco-design/web-react/es/locale/en-US'
import { Message } from './components/common/Message'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ResponsiveProvider } from './providers/ResponsiveProvider'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { GanttChart } from './components/timeline/GanttChart'
import { BrainstormModal } from './components/ai/BrainstormModal'
import { TaskCreationFlow } from './components/ai/TaskCreationFlow'
import { VoiceAmendmentModal } from './components/voice'
import { WorkStatusWidget } from './components/status/WorkStatusWidget'
import { WorkScheduleModal } from './components/settings/WorkScheduleModal'
import { SessionManager } from './components/session/SessionManager'
import { WorkLoggerDual } from './components/work-logger/WorkLoggerDual'
import { DevTools } from './components/dev/DevTools'
import { useTaskStore } from './store/useTaskStore'
import { exampleSequencedTask } from '@shared/sequencing-types'
import type { TaskStep } from '@shared/types'
import { getDatabase } from './services/database'
import { generateRandomStepId, mapDependenciesToIds } from '@shared/step-id-utils'
import { useLogger, useLoggerContext } from '../logging/index.renderer'
import { appEvents, EVENTS } from './utils/events'


const { Header, Sider, Content } = Layout
const { Title } = Typography
const MenuItem = Menu.Item

import { TaskType, TaskStatus, StepStatus } from '@shared/enums'

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: TaskType
  needsMoreInfo?: boolean
}

function App() {
  const logger = useLogger({ component: 'App' })
  const loggerContext = useLoggerContext()

  // Expose logger to DevTools for debugging
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      (window as any).__logger = logger;
      (window as any).__dumpLogs = () => {
        const entries = loggerContext.dumpBuffer()
        console.log('📝 Ring Buffer Contents:', entries)
        return entries
      }
      console.info('📝 Logger exposed to DevTools. Use __dumpLogs() to see ring buffer contents.')
    }
  }, [logger, loggerContext])

  // Session loading is now handled in useTaskStore.initializeData()
  // to prevent flash of default session

  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar' | 'workflows' | 'timeline'>('tasks')
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [brainstormModalVisible, setBrainstormModalVisible] = useState(false)
  const [taskCreationFlowVisible, setTaskCreationFlowVisible] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [showExampleWorkflow, setShowExampleWorkflow] = useState(false)
  const [showWorkSchedule, setShowWorkSchedule] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [showWorkLoggerDual, setShowWorkLoggerDual] = useState(false)
  const [voiceAmendmentVisible, setVoiceAmendmentVisible] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)

  // Sidebar collapsed state - persist to localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('sidebarCollapsed')
    return saved === 'true'
  })

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    window.localStorage.setItem('sidebarCollapsed', collapsed.toString())
  }

  const {
    tasks,
    sequencedTasks,
    addTask,
    addSequencedTask,
    addOrUpdateSequencedTask,
    loadSequencedTasks,
    updateSequencedTask,
    deleteSequencedTask,
    currentWeeklySchedule,
    isScheduling,
    generateWeeklySchedule,
    initializeData,
    isLoading,
    error,
    startWorkOnStep,
    pauseWorkOnStep,
  } = useTaskStore()

  const incompleteTasks = tasks.filter(task => !task.completed).length
  const activeWorkflows = sequencedTasks.filter(w => w.overallStatus !== 'completed').length

  // Initialize data when app starts
  useEffect(() => {
    logger.info('App initialization started', {
      tasksCount: tasks.length,
      sequencedTasksCount: sequencedTasks.length,
    })
    initializeData()
  }, [initializeData])

  // Listen for data refresh events
  useEffect(() => {
    const handleDataRefresh = () => {
      logger.debug('Data refresh event received')
      initializeData()
    }

    const handleSessionChanged = () => {
      logger.debug('Session change event received')
      initializeData()
    }

    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    appEvents.on(EVENTS.SESSION_CHANGED, handleSessionChanged)

    return () => {
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
      appEvents.off(EVENTS.SESSION_CHANGED, handleSessionChanged)
    }
  }, [initializeData])

  // Log view changes
  useEffect(() => {
    logger.debug('View changed', { view: activeView })
  }, [activeView])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd/Ctrl + Shift + D for DevTools
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        logger.debug('DevTools opened via keyboard shortcut')
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

  const handleTasksExtracted = (tasks: ExtractedTask[]): void => {
    logger.info('Tasks extracted from brainstorm', { count: tasks.length })
    setExtractedTasks(tasks)
    setBrainstormModalVisible(false)
    setTaskCreationFlowVisible(true)
  }

  const handleWorkflowsExtracted = async (workflows: any[], standaloneTasks: ExtractedTask[]): Promise<void> => {
    try {
      logger.info('Workflows extracted from brainstorm', {
        workflowCount: workflows.length,
        standaloneTaskCount: standaloneTasks.length,
      })
      // Create workflows
      for (const workflow of workflows) {
        // Combine description and notes
        const combinedNotes = workflow.description
          ? `${workflow.description}${workflow.notes ? '\n\n' + workflow.notes : ''}`
          : workflow.notes || ''

        // Check if a workflow with this name already exists to preserve step IDs
        const existingWorkflow = sequencedTasks.find(wf => wf.name === workflow.name)

        // Create step IDs - preserve existing ones if updating
        let stepsWithIds: any[]
        if (existingWorkflow && existingWorkflow.steps) {
          // Build map of existing step names to IDs
          const existingStepMap = new Map<string, string>()
          existingWorkflow.steps.forEach((step: any) => {
            existingStepMap.set(step.name, step.id)
          })

          // Assign IDs to steps, preserving existing ones
          stepsWithIds = workflow.steps.map((step: any, index: number) => {
            const existingId = existingStepMap.get(step.name)
            return {
              ...step,
              id: existingId || generateRandomStepId(),
              status: StepStatus.Pending,
              stepIndex: index,
            }
          })
        } else {
          // New workflow - generate fresh IDs
          stepsWithIds = workflow.steps.map((step: any, index: number) => {
            return {
              ...step,
              id: generateRandomStepId(),
              status: StepStatus.Pending,
              stepIndex: index,
            }
          })
        }

        // Map dependencies from names to IDs first (preserves all fields)
        const stepsWithFixedDeps = mapDependenciesToIds(stepsWithIds)

        // Ensure all required TaskStep fields are present
        const completeSteps: TaskStep[] = stepsWithFixedDeps.map((step: any) => ({
          id: step.id,
          taskId: '', // Will be set by database
          name: step.name,
          duration: step.duration || 60,
          type: step.type || TaskType.Focused,
          dependsOn: step.dependsOn || [],
          asyncWaitTime: step.asyncWaitTime || 0,
          status: step.status || StepStatus.Pending,
          stepIndex: step.stepIndex ?? 0,
          percentComplete: step.percentComplete ?? 0,
          notes: step.notes || undefined,
        }))

        const sequencedTask = {
          name: workflow.name,
          importance: workflow.importance,
          urgency: workflow.urgency,
          type: workflow.type,
          notes: combinedNotes,
          dependencies: [],
          completed: false,
          duration: workflow.totalDuration || 0,
          asyncWaitTime: 0,
          sessionId: '',  // Will be set by database
          hasSteps: true as true,
          criticalPathDuration: workflow.totalDuration || 0, // Will be calculated properly
          worstCaseDuration: (workflow.totalDuration || 0) * 1.5, // Estimate
          overallStatus: TaskStatus.NotStarted,
          steps: completeSteps,
        }

        // Use addOrUpdateSequencedTask which handles the logic
        await addOrUpdateSequencedTask(sequencedTask)
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
          overallStatus: TaskStatus.NotStarted,
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
      logger.error('Error creating workflows', { error })
      Message.error('Failed to create workflows and tasks')
    }
  }

  const handleTaskCreationComplete = (): void => {
    setTaskCreationFlowVisible(false)
    setExtractedTasks([])
  }

  const handleDeleteSequencedTask = async (taskId: string): Promise<void> => {
    try {
      await deleteSequencedTask(taskId)
      Message.success('Workflow deleted successfully')
    } catch (error) {
      logger.error('Error deleting workflow', { error })
      Message.error('Failed to delete workflow')
    }
  }

  const handleStartWorkflow = async (id: string): Promise<void> => {
    try {
      // Find the workflow
      const workflow = sequencedTasks.find(st => st.id === id)
      if (!workflow) return

      // Find the first pending step or the current in-progress step
      let stepToStart = workflow.steps.find(step => step.status === StepStatus.InProgress)

      if (!stepToStart) {
        stepToStart = workflow.steps.find(step => step.status === StepStatus.Pending)
        if (!stepToStart) {
          Message.warning('No pending steps in this workflow')
          return
        }
      }

      // Start time tracking on the step
      startWorkOnStep(stepToStart.id, id)

      // Update the workflow status to in_progress and set the current step
      await updateSequencedTask(id, {
        overallStatus: TaskStatus.InProgress,
        currentStepId: stepToStart.id,
        steps: workflow.steps.map(step =>
          step.id === stepToStart!.id
            ? { ...step, status: StepStatus.InProgress }
            : step,
        ),
      })

      Message.success('Workflow started - time tracking active')
      logger.info(`Started time tracking for step: ${stepToStart.name}`)
    } catch (error) {
      logger.error('Failed to start workflow', { error })
      Message.error('Failed to start workflow')
    }
  }

  const handlePauseWorkflow = async (id: string): Promise<void> => {
    try {
      const workflow = sequencedTasks.find(st => st.id === id)
      if (!workflow) return

      // Find the current in-progress step
      const inProgressStep = workflow.steps.find(step => step.status === StepStatus.InProgress)

      // Pause time tracking if there's an active step
      if (inProgressStep) {
        await pauseWorkOnStep(inProgressStep.id)
        logger.info(`Paused time tracking for step: ${inProgressStep.name}`)
      }

      // Update the workflow and step statuses
      const updatedSteps = workflow.steps.map(step =>
        step.status === StepStatus.InProgress
          ? { ...step, status: StepStatus.Pending }
          : step,
      )

      await updateSequencedTask(id, {
        overallStatus: TaskStatus.NotStarted,
        currentStepId: null as any,
        steps: updatedSteps,
      })

      Message.success('Workflow paused - time logged')
    } catch (error) {
      logger.error('Failed to pause workflow', { error })
      Message.error('Failed to pause workflow')
    }
  }

  const handleUpdateStep = async (stepId: string, updates: any): Promise<void> => {
    try {
      await getDatabase().updateTaskStepProgress(stepId, updates)
      // Refresh the sequenced tasks to show updated status
      await loadSequencedTasks()
      Message.success('Step updated successfully')
    } catch (error) {
      logger.error('Failed to update step', { error })
      Message.error('Failed to update step')
    }
  }

  const handleResetWorkflow = async (id: string): Promise<void> => {
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
        status: StepStatus.Pending,
        completedAt: null as any,
        actualDuration: null as any,
        startedAt: null as any,
      }))

      await updateSequencedTask(id, {
        overallStatus: TaskStatus.NotStarted,
        currentStepId: null as any,
        steps: resetSteps,
      })

      Message.success('Workflow reset to initial state')
    } catch (error) {
      logger.error('Failed to reset workflow', { error })
      Message.error('Failed to reset workflow')
    }
  }

  const handleDeleteAllSequencedTasks = async (): Promise<void> => {
    try {
      await getDatabase().deleteAllSequencedTasks()
      await initializeData() // Reload all data
      Message.success('All workflows deleted successfully')
    } catch (error) {
      logger.error('Error deleting all workflows', { error })
      Message.error('Failed to delete all workflows')
    }
  }

  return (
    <ResponsiveProvider>
      <ConfigProvider
        locale={enUS}
        theme={{
        primaryColor: '#165DFF',
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={sidebarCollapsed}
          onCollapse={handleSidebarCollapse}
          width={240}
          collapsedWidth={80}
          style={{
            background: '#fff',
            boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{
            padding: sidebarCollapsed ? '24px 10px' : '24px 20px',
            borderBottom: '1px solid #E5E8EF',
            textAlign: sidebarCollapsed ? 'center' : 'left',
          }}>
            {!sidebarCollapsed ? (
              <Title heading={4} style={{ margin: 0, color: '#1D2129' }}>
                Work Capacity Planner
              </Title>
            ) : (
              <Title heading={5} style={{ margin: 0, color: '#1D2129' }}>
                WCP
              </Title>
            )}
          </div>

          <Menu
            selectedKeys={[activeView]}
            onClickMenuItem={(key) => setActiveView(key as any)}
            style={{ marginTop: 20 }}
          >
            <MenuItem key="tasks">
              <Tooltip
                content="Task List"
                position="right"
                disabled={!sidebarCollapsed}
              >
                <Space>
                  <IconList />
                  {!sidebarCollapsed && <span>Task List</span>}
                  {incompleteTasks > 0 && (
                    <Badge count={incompleteTasks} dot offset={[6, -4]} />
                  )}
                </Space>
              </Tooltip>
            </MenuItem>
            <MenuItem key="matrix">
              <Tooltip
                content="Eisenhower Matrix"
                position="right"
                disabled={!sidebarCollapsed}
              >
                <Space>
                  <IconApps />
                  {!sidebarCollapsed && <span>Eisenhower Matrix</span>}
                </Space>
              </Tooltip>
            </MenuItem>
            <MenuItem key="calendar">
              <Tooltip
                content="Calendar"
                position="right"
                disabled={!sidebarCollapsed}
              >
                <Space>
                  <IconCalendar />
                  {!sidebarCollapsed && <span>Calendar</span>}
                </Space>
              </Tooltip>
            </MenuItem>
            <MenuItem key="workflows">
              <Tooltip
                content="Workflows"
                position="right"
                disabled={!sidebarCollapsed}
              >
                <Space>
                  <IconBranch />
                  {!sidebarCollapsed && <span>Workflows</span>}
                  {activeWorkflows > 0 && (
                    <Badge count={activeWorkflows} dot offset={[6, -4]} />
                  )}
                </Space>
              </Tooltip>
            </MenuItem>
            <MenuItem key="timeline">
              <Tooltip
                content="Timeline"
                position="right"
                disabled={!sidebarCollapsed}
              >
                <Space>
                  <IconSchedule />
                  {!sidebarCollapsed && <span>Timeline</span>}
                </Space>
              </Tooltip>
            </MenuItem>
          </Menu>

          {/* Work Status Widget */}
          {!sidebarCollapsed && (
            <div style={{ padding: '20px 16px' }}>
              <WorkStatusWidget onEditSchedule={() => setShowWorkSchedule(true)} />
            </div>
          )}

          <div style={{
            position: 'absolute',
            bottom: 24,
            left: sidebarCollapsed ? 10 : 20,
            right: sidebarCollapsed ? 10 : 20,
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
                size={sidebarCollapsed ? 'default' : 'large'}
                icon={<IconPlus />}
                long
                style={{
                  boxShadow: '0 4px 10px rgba(22, 93, 255, 0.2)',
                  fontWeight: 500,
                }}
              >
                {!sidebarCollapsed ? (
                  <>Add Task <IconDown style={{ marginLeft: 8 }} /></>
                ) : (
                  <IconDown />
                )}
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
                type="primary"
                icon={<IconClockCircle />}
                onClick={() => setShowWorkLoggerDual(true)}
              >
                Log Work
              </Button>
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
                          onUpdateStep={handleUpdateStep}
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

        <VoiceAmendmentModal
          visible={voiceAmendmentVisible}
          onClose={() => setVoiceAmendmentVisible(false)}
          onAmendmentsApplied={async (amendments) => {
            // Apply amendments from voice input
            try {
              const { applyAmendments } = await import('./utils/amendment-applicator')
              await applyAmendments(amendments)
              // Refresh data to show changes
              await initializeData()
            } catch (error) {
              logger.error('Failed to apply amendments', { error })
              Message.error('Failed to apply amendments')
            }
          }}
        />

        <TaskCreationFlow
          visible={taskCreationFlowVisible}
          onClose={handleTaskCreationComplete}
          extractedTasks={extractedTasks}
        />

        <WorkScheduleModal
          visible={showWorkSchedule}
          onClose={() => setShowWorkSchedule(false)}
          onSave={(): void => {
            // Refresh any data if needed
            setShowWorkSchedule(false)
          }}
        />

        <WorkLoggerDual
          visible={showWorkLoggerDual}
          onClose={() => setShowWorkLoggerDual(false)}
        />

        <SessionManager
          visible={showSessionManager}
          onClose={() => setShowSessionManager(false)}
          onSessionChange={(): void => {
            // Reload data when session changes
            initializeData()
          }}
        />
        <DevTools
          visible={showDevTools}
          onClose={() => setShowDevTools(false)}
        />

        {/* Task Creation Forms */}
        <TaskForm
          visible={taskFormVisible}
          onClose={() => setTaskFormVisible(false)}
        />

        {/* Floating Action Button for Voice Amendments */}
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<IconSoundFill />}
          onClick={() => setVoiceAmendmentVisible(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            boxShadow: '0 4px 12px rgba(22, 93, 255, 0.3)',
            zIndex: 1000,
          }}
        />
      </Layout>
    </ConfigProvider>
    </ResponsiveProvider>
  )
}

export default App
