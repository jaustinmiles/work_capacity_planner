import { useState, useEffect } from 'react'
import { Layout, Typography, ConfigProvider, Button, Space, Badge, Spin, Alert, Popconfirm, Tabs, Modal } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconBranch, IconSchedule, IconBulb, IconDelete, IconUserGroup, IconClockCircle, IconMenuFold, IconMenuUnfold, IconEye, IconSettings } from '@arco-design/web-react/icon'
import enUS from '@arco-design/web-react/es/locale/en-US'
import { Message } from './components/common/Message'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ResponsiveProvider, useResponsive } from './providers/ResponsiveProvider'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { GanttChart } from './components/timeline/GanttChart'
import { BrainstormChat } from './components/ai/BrainstormChat'
import { TaskCreationFlow } from './components/ai/TaskCreationFlow'
// VoiceAmendmentModal removed - voice functionality now integrated into BrainstormChat
import { WorkStatusWidget } from './components/status/WorkStatusWidget'
import { WorkScheduleModal } from './components/settings/WorkScheduleModal'
import { MultiDayScheduleEditor } from './components/settings/MultiDayScheduleEditor'
import { SessionManager } from './components/session/SessionManager'
import { TaskTypeManager } from './components/settings/TaskTypeManager'
import { WorkLoggerDual } from './components/work-logger/WorkLoggerDual'
import { TaskSlideshow } from './components/slideshow/TaskSlideshow'
import { DevTools } from './components/dev/DevTools'
import { useTaskStore } from './store/useTaskStore'
import { useWorkPatternStore } from './store/useWorkPatternStore'
import { connectStores } from './store/storeConnector'
import { getDatabase } from './services/database'
import { logger } from '@/logger'


const { Header, Sider, Content } = Layout
const { Title } = Typography

import { TaskStatus, StepStatus, ViewType } from '@shared/enums'

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: string
  needsMoreInfo?: boolean
}

function App() {
  // Initialize stores and connections
  useEffect(() => {
    logger.system.info('Initializing reactive stores', {}, 'app-init')

    // Connect stores for reactive updates
    const disconnectStores = connectStores()

    // Initialize work patterns
    useWorkPatternStore.getState().loadWorkPatterns()

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
        switch (entry.level) {
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

    return () => {
      disconnectStores?.()
    }
  }, [])

  // Session loading is now handled in useTaskStore.initializeData()
  // to prevent flash of default session

  const [activeView, setActiveView] = useState<ViewType>(ViewType.Timeline)
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [brainstormModalVisible, setBrainstormModalVisible] = useState(false)
  const [taskCreationFlowVisible, setTaskCreationFlowVisible] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [showWorkSchedule, setShowWorkSchedule] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [showWorkLoggerDual, setShowWorkLoggerDual] = useState(false)
  const [showTaskSlideshow, setShowTaskSlideshow] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [showTaskTypeManager, setShowTaskTypeManager] = useState(false)

  // Responsive breakpoints
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)
  const { isCompact, isMobile } = useResponsive()

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
    addSequencedTask,
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

    // Start polling for expired wait times (separate from task completion)
    // This prevents race conditions during task completion
    const cleanupPolling = useTaskStore.getState().startExpiredWaitTimePolling()

    // Cleanup polling on unmount
    return () => {
      cleanupPolling()
    }
  }, []) // Empty dependency array - run once on mount. We omit initializeData to avoid infinite re-renders.

  // Stores now handle data refresh automatically through reactive subscriptions
  // No need for event listeners or manual refresh handlers

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
              {/* Horizontal Navigation Tabs - hide text on mobile */}
              <Tabs
                activeTab={activeView}
                onChange={(key) => setActiveView(key as ViewType)}
                type="line"
                style={{ flex: 1, minWidth: 0 }}
              >
                <Tabs.TabPane
                  key={ViewType.Timeline}
                  title={
                    <Space>
                      <IconSchedule />
                      {!isMobile && <span>Timeline</span>}
                    </Space>
                  }
                />
                <Tabs.TabPane
                  key={ViewType.Schedule}
                  title={
                    <Space>
                      <IconCalendar />
                      {!isMobile && <span>Schedule</span>}
                    </Space>
                  }
                />
                <Tabs.TabPane
                  key={ViewType.Workflows}
                  title={
                    <Space>
                      <IconBranch />
                      {!isMobile && <span>Workflows</span>}
                      {activeWorkflows > 0 && <Badge count={activeWorkflows} dot />}
                    </Space>
                  }
                />
                <Tabs.TabPane
                  key={ViewType.Tasks}
                  title={
                    <Space>
                      <IconList />
                      {!isMobile && <span>Tasks</span>}
                      {incompleteTasks > 0 && <Badge count={incompleteTasks} dot />}
                    </Space>
                  }
                />
                <Tabs.TabPane
                  key={ViewType.Calendar}
                  title={
                    <Space>
                      <IconCalendar />
                      {!isMobile && <span>Calendar</span>}
                    </Space>
                  }
                />
                <Tabs.TabPane
                  key={ViewType.Matrix}
                  title={
                    <Space>
                      <IconApps />
                      {!isMobile && <span>Matrix</span>}
                    </Space>
                  }
                />
              </Tabs>

              {/* Action Buttons - collapse to icons on small screens */}
              <Space wrap style={{ flexShrink: 0 }}>
                <Button
                  type="primary"
                  icon={<IconClockCircle />}
                  onClick={() => setShowWorkLoggerDual(true)}
                  title="Log Work"
                >
                  {!isCompact && 'Log Work'}
                </Button>
                <Button
                  type="text"
                  icon={<IconEye />}
                  onClick={() => setShowTaskSlideshow(true)}
                  title="Tournament"
                >
                  {!isCompact && 'Tournament'}
                </Button>
                <Button
                  type="text"
                  icon={<IconSettings />}
                  onClick={() => setShowTaskTypeManager(true)}
                  title="Settings"
                >
                  {!isCompact && 'Settings'}
                </Button>
                <Button
                  type="text"
                  icon={<IconUserGroup />}
                  onClick={() => setShowSessionManager(true)}
                  title="Sessions"
                >
                  {!isCompact && 'Sessions'}
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
                    {activeView === ViewType.Tasks && (
                      <ErrorBoundary>
                        <TaskList onAddTask={() => setTaskFormVisible(true)} />
                      </ErrorBoundary>
                    )}

                    {activeView === ViewType.Matrix && (
                      <ErrorBoundary>
                        <EisenhowerMatrix onAddTask={() => setTaskFormVisible(true)} />
                      </ErrorBoundary>
                    )}

                    {activeView === ViewType.Calendar && (
                      <ErrorBoundary>
                        <WeeklyCalendar />
                      </ErrorBoundary>
                    )}

                    {activeView === ViewType.Workflows && (
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

                    {activeView === ViewType.Timeline && (
                      <ErrorBoundary>
                        <GanttChart
                          tasks={tasks}
                          sequencedTasks={sequencedTasks}
                        />
                      </ErrorBoundary>
                    )}

                    {activeView === ViewType.Schedule && (
                      <ErrorBoundary>
                        <MultiDayScheduleEditor
                          visible={true}
                          onClose={() => setActiveView(ViewType.Timeline)}
                          onSave={() => {
                            // Work patterns update reactively via storeConnector - no need to reload tasks
                            // initializeData() wipes tasks and causes timeline to blank out
                            setActiveView(ViewType.Timeline)
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

          <BrainstormChat
            visible={brainstormModalVisible}
            onClose={() => setBrainstormModalVisible(false)}
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

          {/* Task Type Settings Modal */}
          <Modal
            title="Task Type Settings"
            visible={showTaskTypeManager}
            onCancel={() => setShowTaskTypeManager(false)}
            footer={null}
            style={{ width: 600 }}
          >
            <TaskTypeManager embedded onTypesChange={() => {
              // Types update reactively via store - no need to reload
            }} />
          </Modal>
          <DevTools
            visible={showDevTools}
            onClose={() => setShowDevTools(false)}
          />

          {/* Task Creation Forms */}
          <TaskForm
            visible={taskFormVisible}
            onClose={() => setTaskFormVisible(false)}
          />

          {/* Floating Brain Button for AI Brainstorm (includes voice input) */}
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
