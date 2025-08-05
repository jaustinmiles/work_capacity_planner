import React, { useState, useEffect } from 'react'
import { Layout, Menu, Typography, ConfigProvider, Button, Space, Badge, Dropdown, Spin, Alert } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconPlus, IconDown, IconBranch, IconSchedule } from '@arco-design/web-react/icon'
import enUS from '@arco-design/web-react/es/locale/en-US'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { Timeline } from './components/timeline/Timeline'
import { useTaskStore } from './store/useTaskStore'
import { exampleSequencedTask } from '@shared/sequencing-types'

const { Header, Sider, Content } = Layout
const { Title } = Typography
const MenuItem = Menu.Item

function App() {
  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar' | 'workflows' | 'timeline'>('tasks')
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [showExampleWorkflow, setShowExampleWorkflow] = useState(false)
  const { 
    tasks, 
    sequencedTasks, 
    addSequencedTask, 
    currentWeeklySchedule, 
    isScheduling, 
    generateWeeklySchedule,
    initializeData,
    isLoading,
    error
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
              {activeView === 'timeline' && 'Smart Timeline'}
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
                      <div style={{ marginBottom: 16 }}>
                        <Typography.Title heading={5}>Your Workflows ({sequencedTasks.length})</Typography.Title>
                      </div>
                      
                      {sequencedTasks.map(task => (
                        <SequencedTaskView 
                          key={task.id}
                          task={task}
                          onStartWorkflow={() => console.log('Start workflow:', task.id)}
                          onPauseWorkflow={() => console.log('Pause workflow:', task.id)}
                          onResetWorkflow={() => console.log('Reset workflow:', task.id)}
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
                      onStartWorkflow={() => console.log('Start workflow')}
                      onPauseWorkflow={() => console.log('Pause workflow')}
                      onResetWorkflow={() => console.log('Reset workflow')}
                    />
                  )}
                </Space>
              )}
              
              {activeView === 'timeline' && (
                <Timeline 
                  weeklySchedule={currentWeeklySchedule}
                  onItemClick={(item) => console.log('Timeline item clicked:', item)}
                  onStartItem={(item) => console.log('Start item:', item)}
                  onPauseItem={(item) => console.log('Pause item:', item)}
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
            console.log('Sequenced task created:', taskData)
            await addSequencedTask(taskData)
          }}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App