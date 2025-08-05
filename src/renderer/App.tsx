import React, { useState } from 'react'
import { Layout, Menu, Typography, ConfigProvider, Button, Space, Badge, Dropdown } from '@arco-design/web-react'
import { IconApps, IconCalendar, IconList, IconPlus, IconDown, IconBranch } from '@arco-design/web-react/icon'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { SequencedTaskForm } from './components/tasks/SequencedTaskForm'
import { SequencedTaskView } from './components/tasks/SequencedTaskView'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { useTaskStore } from './store/useTaskStore'
import { exampleSequencedTask } from '@shared/sequencing-types'

const { Header, Sider, Content } = Layout
const { Title } = Typography
const MenuItem = Menu.Item

function App() {
  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar' | 'workflows'>('tasks')
  const [taskFormVisible, setTaskFormVisible] = useState(false)
  const [sequencedTaskFormVisible, setSequencedTaskFormVisible] = useState(false)
  const [showExampleWorkflow, setShowExampleWorkflow] = useState(false)
  const { tasks } = useTaskStore()
  
  const incompleteTasks = tasks.filter(task => !task.completed).length

  return (
    <ConfigProvider
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
            </Title>
          </Header>
          
          <Content style={{
            padding: 24,
            background: '#F7F8FA',
            overflow: 'auto',
          }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          onSubmit={(taskData) => {
            console.log('Sequenced task created:', taskData)
            // TODO: Add to store
          }}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App