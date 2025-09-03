import { useState, useRef, useEffect } from 'react'
import { TaskType } from '@shared/enums'
import { Card, Grid, Typography, Space, Tag, Empty, Button, Badge, Tooltip, Slider, Radio } from '@arco-design/web-react'
import { IconFire, IconCalendar, IconUser, IconClose, IconPlus, IconZoomIn, IconZoomOut, IconApps, IconDragDot } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'

const { Row, Col } = Grid
const { Title, Text } = Typography

interface EisenhowerMatrixProps {
  onAddTask: () => void
}

export function EisenhowerMatrix({ onAddTask }: EisenhowerMatrixProps) {
  const { tasks, sequencedTasks, selectTask } = useTaskStore()
  const [zoom, setZoom] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'scatter'>('grid')
  const scatterContainerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 500, height: 500 })

  // Update container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (scatterContainerRef.current) {
        const rect = scatterContainerRef.current.getBoundingClientRect()
        // Account for padding (50px on each side)
        setContainerSize({
          width: rect.width - 100,
          height: rect.height - 100,
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [viewMode]) // Re-calculate when switching views

  // Combine regular tasks and sequenced tasks (workflows)
  // Deduplicate by ID - sequenced tasks take precedence
  const sequencedTaskIds = new Set(sequencedTasks.map(st => st.id))
  const dedupedTasks = tasks.filter(t => !sequencedTaskIds.has(t.id))

  const allTasks = [
    ...dedupedTasks,
    ...sequencedTasks.map(st => ({
      ...st,
      duration: st.duration, // Use totalDuration for sequenced tasks
    })),
  ]

  // Only show incomplete tasks in the matrix
  const incompleteTasks = allTasks.filter(task => !task.completed)

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

  const TaskCard = ({ task, color }: { task: Task; color: string }) => {
    // Check if this is a sequenced task (workflow)
    const isWorkflow = sequencedTasks.some(st => st.id === task.id)

    return (
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
            {isWorkflow && (
              <Tag size="small" color="purple">
                Workflow
              </Tag>
            )}
            <Tag size="small" color={task.type === TaskType.Focused ? 'blue' : 'green'}>
              {task.type === TaskType.Focused ? 'Focused' : 'Admin'}
            </Tag>
            <Tag size="small">
              {Math.floor(task.duration / 60)}h {task.duration % 60}m
            </Tag>
          </Space>
        </Space>
      </Card>
    )
  }

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
      {/* Header with Add Task Button and Zoom Controls */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title heading={5} style={{ margin: 0 }}>
              Eisenhower Priority Matrix
            </Title>
            <Text type="secondary">
              Organize tasks by importance and urgency to focus on what matters most
            </Text>
          </div>
          <Space>
            <Radio.Group
              type="button"
              value={viewMode}
              onChange={setViewMode}
              size="small"
            >
              <Radio value="grid">
                <IconApps /> Grid
              </Radio>
              <Radio value="scatter">
                <IconDragDot /> Scatter
              </Radio>
            </Radio.Group>
            <Space>
              <Button icon={<IconZoomOut />} onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} />
              <Slider
                value={zoom}
                onChange={(val) => setZoom(Array.isArray(val) ? val[0] : val)}
                min={0.5}
                max={2}
                step={0.1}
                style={{ width: 120 }}
                formatTooltip={(val) => `${Math.round(val * 100)}%`}
              />
              <Button icon={<IconZoomIn />} onClick={() => setZoom(Math.min(2, zoom + 0.1))} />
            </Space>
            <Button type="primary" icon={<IconPlus />} onClick={onAddTask}>
              Add Task
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Matrix View */}
      {viewMode === 'grid' ? (
        <div style={{
        position: 'relative',
        overflow: 'auto',
        maxHeight: 'calc(100vh - 300px)',
        border: '1px solid #e5e6eb',
        borderRadius: 4,
        padding: 16,
      }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          width: `${100 / zoom}%`,
        }}>
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
            left: -140,
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            zIndex: 1,
          }}>
            <Text type="secondary" style={{ fontWeight: 500 }}>
              ← Less Important ——— More Important →
            </Text>
          </div>

          {/* Quadrants */}
          <Row gutter={24} style={{ marginTop: 40, marginLeft: 40 }}>
            <Col span={12}>
              <Row gutter={[24, 24]}>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="schedule" />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="eliminate" />
                </Col>
              </Row>
            </Col>
            <Col span={12}>
              <Row gutter={[24, 24]}>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="do-first" />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="delegate" />
                </Col>
              </Row>
            </Col>
          </Row>
        </div>
      </div>
      ) : (
        // Scatter Plot View
        <Card style={{ height: 600, position: 'relative', overflow: 'hidden' }}>
          <div ref={scatterContainerRef} style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            padding: '50px',
          }}>
            {/* Axis Labels */}
            <Text
              type="secondary"
              style={{
                position: 'absolute',
                bottom: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                fontWeight: 500,
              }}
            >
              Urgency →
            </Text>
            <Text
              type="secondary"
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%) rotate(-90deg)',
                fontWeight: 500,
              }}
            >
              Importance →
            </Text>

            {/* Grid Lines and Quadrant Labels */}
            <div style={{
              position: 'absolute',
              top: 50,
              left: 50,
              right: 50,
              bottom: 50,
              border: '2px solid #e5e6eb',
              background: 'white',
            }}>
              {/* Vertical Center Line */}
              <div style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 2,
                background: '#e5e6eb',
              }} />
              {/* Horizontal Center Line */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 2,
                background: '#e5e6eb',
              }} />

              {/* Quadrant Labels */}
              <Text style={{
                position: 'absolute',
                top: 10,
                right: 10,
                color: quadrantConfig['do-first'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Do First
              </Text>
              <Text style={{
                position: 'absolute',
                top: 10,
                left: 10,
                color: quadrantConfig['schedule'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Schedule
              </Text>
              <Text style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                color: quadrantConfig['delegate'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Delegate
              </Text>
              <Text style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                color: quadrantConfig['eliminate'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Eliminate
              </Text>
            </div>

            {/* Task Points - Outside the grid container */}
            {incompleteTasks.map(task => {
                const isWorkflow = sequencedTasks.some(st => st.id === task.id)
                const quadrant = categorizeTask(task)
                const config = quadrantConfig[quadrant]

                // Convert importance/urgency (1-10) to position (0-100%)
                const xPercent = (task.urgency / 10) * 100
                const yPercent = 100 - (task.importance / 10) * 100 // Invert Y axis

                // Calculate bubble size based on duration (min 20px, max 60px)
                const size = Math.min(60, Math.max(20, 20 + (task.duration / 30)))

                // Use actual container dimensions for positioning
                const xPos = 50 + (xPercent / 100) * containerSize.width
                const yPos = 50 + (yPercent / 100) * containerSize.height

                return (
                  <Tooltip
                    key={task.id}
                    content={
                      <Space direction="vertical">
                        <Text style={{ fontWeight: 500 }}>{task.name}</Text>
                        <Space size="small">
                          <Tag size="small">I: {task.importance}</Tag>
                          <Tag size="small">U: {task.urgency}</Tag>
                          <Tag size="small">{Math.floor(task.duration / 60)}h {task.duration % 60}m</Tag>
                        </Space>
                      </Space>
                    }
                  >
                    <div
                      onClick={() => selectTask(task.id)}
                      style={{
                        position: 'absolute',
                        left: xPos,
                        top: yPos,
                        transform: `translate(-50%, -50%) scale(${zoom})`,
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: config.color,
                        opacity: 0.8,
                        border: isWorkflow ? '3px solid purple' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s',
                        zIndex: 10,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.transform = `translate(-50%, -50%) scale(${zoom * 1.1})`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.8'
                        e.currentTarget.style.transform = `translate(-50%, -50%) scale(${zoom})`
                      }}
                    >
                      <Text style={{
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 500,
                        textAlign: 'center',
                        padding: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {task.name.substring(0, 3)}
                      </Text>
                    </div>
                  </Tooltip>
                )
            })}
          </div>
        </Card>
      )}

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
