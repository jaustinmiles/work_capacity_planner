import { useState, useEffect } from 'react'
import { Layout, Typography, ConfigProvider, Button, Space, Badge, Spin, Alert, Popconfirm, Tabs } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconBranch, IconSchedule, IconBulb, IconDelete, IconUserGroup, IconSoundFill, IconClockCircle, IconMenuFold, IconMenuUnfold, IconEye } from '@arco-design/web-react/icon'
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
import { MultiDayScheduleEditor } from './components/settings/MultiDayScheduleEditor'
import { SessionManager } from './components/session/SessionManager'
import { WorkLoggerDual } from './components/work-logger/WorkLoggerDual'
import { TaskSlideshow } from './components/slideshow/TaskSlideshow'
import { DevTools } from './components/dev/DevTools'
import { useTaskStore } from './store/useTaskStore'
import type { TaskStep } from '@shared/types'
import { getDatabase } from './services/database'
import { generateRandomStepId, mapDependenciesToIds } from '@shared/step-id-utils'
import { logger } from '@/logger'
import { appEvents, EVENTS } from './utils/events'


const { Header, Sider, Content } = Layout
const { Title } = Typography

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
  // Initialize app logging
  useEffect(() => {
    logger.system.info('Application initialized', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    }, 'app-init')

    // Set up listener for main process logs
    if (window.electronAPI?.onMainLog) {
      window.electronAPI.onMainLog((entry: any) => {
        // Forward main process logs to logger
        const message = `[Main/${entry.scope || 'System'}] ${entry.message}`
        const data = entry.data || undefined

        // Map numeric levels to logger methods
        switch(entry.level) {
          case 0:
            logger.error(message, data)
            break
          case 1:
            logger.warn(message, data)
            break
          case 2:
            logger.info(message, data)
            break
          case 3:
            logger.debug(message, data)
            break
          default:
            logger.info(message, data)
        }
      })
    }
  }, [])

  // Session loading is now handled in useTaskStore.initializeData()
  // to prevent flash of default session

  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar' | 'workflows' | 'timeline' | 'schedule'>('tasks')
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [brainstormModalVisible, setBrainstormModalVisible] = useState(false)
  const [taskCreationFlowVisible, setTaskCreationFlowVisible] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [showWorkSchedule, setShowWorkSchedule] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [showWorkLoggerDual, setShowWorkLoggerDual] = useState(false)
  const [showTaskSlideshow, setShowTaskSlideshow] = useState(false)
  const [voiceAmendmentVisible, setVoiceAmendmentVisible] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)

  // Responsive breakpoints
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)

  // Sidebar collapsed state - persist to localStorage + auto-collapse on narrow screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('sidebarCollapsed')
    const userPreference = saved === 'true'
    // Auto-collapse below 1024px unless user explicitly set it
    const shouldAutoCollapse = window.innerWidth < 1024 && saved === null
    return userPreference || shouldAutoCollapse
  })

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth
      setScreenWidth(newWidth)

      // Auto-collapse sidebar on narrow screens (only if not user-set)
      const userSet = window.localStorage.getItem('sidebarCollapsed') !== null
      if (!userSet) {
        const shouldCollapse = newWidth < 1024
        if (shouldCollapse !== sidebarCollapsed) {
          setSidebarCollapsed(shouldCollapse)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [sidebarCollapsed])

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
    logger.system.info('App initialization started - loading data from database', {}, 'app-data-init')
    initializeData()
  }, []) // Empty dependency array - run once on mount. We omit initializeData to avoid infinite re-renders.

  // Listen for data refresh events
  useEffect(() => {
    const handleDataRefresh = () => {
      logger.system.debug('Data refresh event received', {}, 'data-refresh-event')
      // Call initializeData directly from store to avoid dependency issues
      useTaskStore.getState().initializeData()
    }

    const handleSessionChanged = () => {
      logger.system.debug('Session change event received', {}, 'session-change-event')
      // Call initializeData directly from store to avoid dependency issues
      useTaskStore.getState().initializeData()
    }

    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    appEvents.on(EVENTS.SESSION_CHANGED, handleSessionChanged)

    return () => {
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
      appEvents.off(EVENTS.SESSION_CHANGED, handleSessionChanged)
    }
  }, [])

  // Log view changes
  useEffect(() => {
    logger.ui.info('View changed', {
      view: activeView,
    }, 'view-change')
  }, [activeView])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd/Ctrl + Shift + D for DevTools
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        logger.ui.debug('DevTools opened via keyboard shortcut', {}, 'devtools-shortcut')
        setShowDevTools(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])


  const handleTasksExtracted = (tasks: ExtractedTask[]): void => {
    logger.ui.info('Tasks extracted from brainstorm', { count: tasks.length }, 'brainstorm-extract-tasks')
    setExtractedTasks(tasks)
    setBrainstormModalVisible(false)
    setTaskCreationFlowVisible(true)
  }

  const handleWorkflowsExtracted = async (workflows: any[], standaloneTasks: ExtractedTask[]): Promise<void> => {
    try {
      logger.ui.info('Workflows extracted from brainstorm', {
        workflowCount: workflows.length,
        standaloneTaskCount: standaloneTasks.length,
      }, 'brainstorm-extract-workflows')
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
          archived: false,
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
          archived: false,
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
      logger.ui.error('Error creating workflows', {
        error: error instanceof Error ? error.message : String(error),
      }, 'workflow-create-error')
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
      logger.ui.error('Error deleting workflow', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'workflow-delete-error')
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
      logger.ui.info('Started time tracking for step', { stepName: stepToStart.name, workflowId: id }, 'workflow-step-start')
    } catch (error) {
      logger.ui.error('Failed to start workflow', {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id,
      }, 'workflow-start-error')
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
        logger.ui.info('Paused time tracking for step', { stepName: inProgressStep.name, workflowId: id }, 'workflow-step-pause')
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
      logger.ui.error('Failed to pause workflow', {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id,
      }, 'workflow-pause-error')
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
      logger.ui.error('Failed to update step', {
        error: error instanceof Error ? error.message : String(error),
        stepId,
      }, 'step-update-error')
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
      logger.ui.error('Failed to reset workflow', {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id,
      }, 'workflow-reset-error')
      Message.error('Failed to reset workflow')
    }
  }

  const handleDeleteAllSequencedTasks = async (): Promise<void> => {
    try {
      await getDatabase().deleteAllSequencedTasks()
      await initializeData() // Reload all data
      Message.success('All workflows deleted successfully')
    } catch (error) {
      logger.ui.error('Error deleting all workflows', {
        error: error instanceof Error ? error.message : String(error),
      }, 'workflows-delete-all-error')
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
          width={screenWidth < 768 ? 280 : 320} // Increased width to prevent text wrapping
          collapsedWidth={screenWidth < 768 ? 60 : 80} // Even narrower when collapsed on mobile
          trigger={null}
          style={{
            background: '#fff',
            boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            // Responsive sidebar width
            minWidth: sidebarCollapsed ? (screenWidth < 768 ? 60 : 80) : (screenWidth < 768 ? 280 : 320),
            maxWidth: sidebarCollapsed ? (screenWidth < 768 ? 60 : 80) : (screenWidth < 768 ? 280 : 320),
          }}
        >
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #E5E8EF',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 60,
          }}>
            <Button
              type="text"
              size="default"
              icon={sidebarCollapsed ? <IconMenuUnfold /> : <IconMenuFold />}
              onClick={() => handleSidebarCollapse(!sidebarCollapsed)}
              style={{
                minWidth: 32,
                padding: '4px 8px',
              }}
            />
            {!sidebarCollapsed && (
              <Title heading={5} style={{ margin: 0, color: '#1D2129', flex: 1 }}>
                Work Capacity
              </Title>
            )}
          </div>


          {/* Work Status Widget */}
          {!sidebarCollapsed && (
            <div style={{ padding: '20px 16px' }}>
              <WorkStatusWidget />
            </div>
          )}

        </Sider>

        <Layout>
          <Header style={{
            background: '#FAFBFC',
            borderBottom: '1px solid #E5E8EF',
            padding: '0 24px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}>
            {/* Horizontal Navigation Tabs */}
            <Tabs
              activeTab={activeView}
              onChange={(key) => setActiveView(key as any)}
              type="line"
              style={{ flex: 1, minWidth: 0 }}
            >
              <Tabs.TabPane
                key="tasks"
                title={
                  <Space>
                    <IconList />
                    <span>Tasks</span>
                    {incompleteTasks > 0 && <Badge count={incompleteTasks} dot />}
                  </Space>
                }
              />
              <Tabs.TabPane
                key="matrix"
                title={
                  <Space>
                    <IconApps />
                    <span>Matrix</span>
                  </Space>
                }
              />
              <Tabs.TabPane
                key="calendar"
                title={
                  <Space>
                    <IconCalendar />
                    <span>Calendar</span>
                  </Space>
                }
              />
              <Tabs.TabPane
                key="workflows"
                title={
                  <Space>
                    <IconBranch />
                    <span>Workflows</span>
                    {activeWorkflows > 0 && <Badge count={activeWorkflows} dot />}
                  </Space>
                }
              />
              <Tabs.TabPane
                key="timeline"
                title={
                  <Space>
                    <IconSchedule />
                    <span>Timeline</span>
                  </Space>
                }
              />
              <Tabs.TabPane
                key="schedule"
                title={
                  <Space>
                    <IconCalendar />
                    <span>Schedule</span>
                  </Space>
                }
              />
            </Tabs>

            {/* Action Buttons */}
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
                icon={<IconEye />}
                onClick={() => setShowTaskSlideshow(true)}
              >
                Slideshow
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
            padding: screenWidth < 768 ? 12 : 24, // Less padding on mobile
            background: '#F7F8FA',
            overflow: 'auto',
            minWidth: 320, // CRITICAL FIX: Prevent extreme narrowing causing text breaking
            flex: 1, // Take remaining space
            maxWidth: '100%',
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
                  {/* Header with Add Button */}
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography.Title heading={5}>
                      {sequencedTasks.length > 0 ? `Your Workflows (${sequencedTasks.length})` : 'Workflows'}
                    </Typography.Title>
                    <Space>
                      <Button
                        type="primary"
                        onClick={() => setSequencedTaskFormVisible(true)}
                      >
                        Add Sequenced Task
                      </Button>
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
                    </Space>
                  </div>

                  {/* User's Created Workflows */}
                  {sequencedTasks.length > 0 ? (
                    sequencedTasks
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
                      ))
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '60px 20px',
                      color: '#86909c',
                    }}>
                      <Typography.Text>
                        No workflows yet. Click &quot;Add Sequenced Task&quot; to create your first workflow.
                      </Typography.Text>
                    </div>
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

              {activeView === 'schedule' && (
                <ErrorBoundary>
                  <MultiDayScheduleEditor
                    visible={true}
                    onClose={() => setActiveView('timeline')}
                    onSave={() => {
                      // Refresh data if needed
                      initializeData()
                    }}
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

        <TaskSlideshow
          visible={showTaskSlideshow}
          onClose={() => setShowTaskSlideshow(false)}
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

        {/* Floating Brain Button for AI Brainstorm */}
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<IconBulb />}
          onClick={() => setBrainstormModalVisible(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            width: 56,
            height: 56,
            backgroundColor: '#faad14',
            borderColor: '#faad14',
            boxShadow: '0 4px 12px rgba(255, 193, 7, 0.3)',
            zIndex: 1000,
          }}
        />
      </Layout>
    </ConfigProvider>
    </ResponsiveProvider>
  )
}

export default App
