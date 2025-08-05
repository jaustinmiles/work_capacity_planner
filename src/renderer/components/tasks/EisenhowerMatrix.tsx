import React from 'react'
import { Card, Grid, Typography, Space, Tag, Empty, Button, Badge, Tooltip } from '@arco-design/web-react'
import { IconFire, IconCalendar, IconUser, IconClose, IconPlus } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'

const { Row, Col } = Grid
const { Title, Text } = Typography

interface EisenhowerMatrixProps {
  onAddTask: () => void
}

export function EisenhowerMatrix({ onAddTask }: EisenhowerMatrixProps) {
  const { tasks, selectTask } = useTaskStore()

  // Only show incomplete tasks in the matrix
  const incompleteTasks = tasks.filter(task => !task.completed)

  // Categorize tasks into quadrants
  const categorizeTask = (task: Task) => {
    if (task.importance >= 7 && task.urgency >= 7) return 'do-first'
    if (task.importance >= 7 && task.urgency < 7) return 'schedule'
    if (task.importance < 7 && task.urgency >= 7) return 'delegate'
    return 'eliminate'
  }

  const quadrants = {
    'do-first': incompleteTasks.filter(task => categorizeTask(task) === 'do-first'),
    'schedule': incompleteTasks.filter(task => categorizeTask(task) === 'schedule'),
    'delegate': incompleteTasks.filter(task => categorizeTask(task) === 'delegate'),
    'eliminate': incompleteTasks.filter(task => categorizeTask(task) === 'eliminate'),
  }

  const quadrantConfig = {
    'do-first': {
      title: 'Do First',
      subtitle: 'Important & Urgent',
      icon: <IconFire />,
      color: '#F53F3F',
      bgColor: '#FFECE8',
      description: 'Critical tasks requiring immediate attention',
    },
    'schedule': {
      title: 'Schedule',
      subtitle: 'Important & Not Urgent',
      icon: <IconCalendar />,
      color: '#165DFF',
      bgColor: '#E8F3FF',
      description: 'Strategic tasks to plan and execute',
    },
    'delegate': {
      title: 'Delegate',
      subtitle: 'Not Important & Urgent',
      icon: <IconUser />,
      color: '#FF7D00',
      bgColor: '#FFF7E8',
      description: 'Tasks that can be assigned to others',
    },
    'eliminate': {
      title: 'Eliminate',
      subtitle: 'Not Important & Not Urgent',
      icon: <IconClose />,
      color: '#86909C',
      bgColor: '#F7F8FA',
      description: 'Low priority tasks to minimize',
    },
  }

  const TaskCard = ({ task, color }: { task: Task; color: string }) => (
    <Card
      hoverable
      style={{
        cursor: 'pointer',
        marginBottom: 8,
        border: `1px solid ${color}20`,
      }}
      onClick={() => selectTask(task.id)}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Text style={{ fontWeight: 500 }}>{task.name}</Text>
        <Space size="small">
          <Tag size="small" color={task.type === 'focused' ? 'blue' : 'green'}>
            {task.type === 'focused' ? 'Focused' : 'Admin'}
          </Tag>
          <Tag size="small">
            {Math.floor(task.duration / 60)}h {task.duration % 60}m
          </Tag>
        </Space>
      </Space>
    </Card>
  )

  const QuadrantCard = ({ quadrant }: { quadrant: keyof typeof quadrants }) => {
    const config = quadrantConfig[quadrant]
    const tasks = quadrants[quadrant]

    return (
      <Card
        style={{
          height: '100%',
          background: config.bgColor,
          border: `2px solid ${config.color}20`,
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Space style={{ marginBottom: 16 }}>
            <div style={{ color: config.color, fontSize: 20 }}>
              {config.icon}
            </div>
            <div>
              <Title heading={6} style={{ margin: 0, color: config.color }}>
                {config.title}
                <Badge count={tasks.length} style={{ marginLeft: 8 }} />
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {config.subtitle}
              </Text>
            </div>
          </Space>

          <Tooltip content={config.description}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
              {config.description}
            </Text>
          </Tooltip>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {tasks.length === 0 ? (
              <Empty
                description={<Text type="secondary">No tasks in this quadrant</Text>}
                style={{ marginTop: 40 }}
              />
            ) : (
              tasks.map(task => (
                <TaskCard key={task.id} task={task} color={config.color} />
              ))
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header with Add Task Button */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title heading={5} style={{ margin: 0 }}>
              Eisenhower Priority Matrix
            </Title>
            <Text type="secondary">
              Organize tasks by importance and urgency to focus on what matters most
            </Text>
          </div>
          <Button type="primary" icon={<IconPlus />} onClick={onAddTask}>
            Add Task
          </Button>
        </Space>
      </Card>

      {/* Matrix Grid */}
      <div style={{ position: 'relative' }}>
        {/* Axis Labels */}
        <div style={{
          position: 'absolute',
          top: -30,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1,
        }}>
          <Text type="secondary" style={{ fontWeight: 500 }}>
            ← Less Urgent ——— More Urgent →
          </Text>
        </div>

        <div style={{
          position: 'absolute',
          left: -100,
          top: '50%',
          transform: 'translateY(-50%) rotate(-90deg)',
          zIndex: 1,
        }}>
          <Text type="secondary" style={{ fontWeight: 500 }}>
            ← Less Important ——— More Important →
          </Text>
        </div>

        {/* Quadrants */}
        <Row gutter={16} style={{ marginTop: 40, marginLeft: 40 }}>
          <Col span={12}>
            <Row gutter={[16, 16]}>
              <Col span={24} style={{ height: 300 }}>
                <QuadrantCard quadrant="schedule" />
              </Col>
              <Col span={24} style={{ height: 300 }}>
                <QuadrantCard quadrant="eliminate" />
              </Col>
            </Row>
          </Col>
          <Col span={12}>
            <Row gutter={[16, 16]}>
              <Col span={24} style={{ height: 300 }}>
                <QuadrantCard quadrant="do-first" />
              </Col>
              <Col span={24} style={{ height: 300 }}>
                <QuadrantCard quadrant="delegate" />
              </Col>
            </Row>
          </Col>
        </Row>
      </div>

      {/* Info Footer */}
      <Card style={{ background: '#F7F8FA' }}>
        <Text type="secondary">
          Tasks are automatically categorized based on their importance and urgency scores.
          Scores of 7 or higher are considered high priority.
        </Text>
      </Card>
    </Space>
  )
}
