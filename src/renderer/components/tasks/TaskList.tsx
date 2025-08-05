import React from 'react'
import { Card, List, Typography, Empty, Space, Tag, Button, Divider, Progress } from '@arco-design/web-react'
import { IconPlus, IconCheckCircle, IconClockCircle } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskItem } from './TaskItem'

const { Title, Text } = Typography

interface TaskListProps {
  onAddTask: () => void
}

export function TaskList({ onAddTask }: TaskListProps) {
  const { tasks } = useTaskStore()
  
  const incompleteTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)
  
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
            <Button
              type="text"
              size="small"
              icon={<IconPlus />}
              onClick={onAddTask}
            >
              Add Task
            </Button>
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
    </Space>
  )
}