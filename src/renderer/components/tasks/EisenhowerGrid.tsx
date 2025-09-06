import React, { useState } from 'react'
import { Card, Grid, Typography, Space, Tag, Button, Slider } from '@arco-design/web-react'
import { IconFire, IconCalendar, IconUser, IconClose, IconPlus, IconZoomIn, IconZoomOut } from '@arco-design/web-react/icon'
import { TaskType } from '@shared/enums'
import { Task } from '@shared/types'
import { useResponsive } from '../../providers/ResponsiveProvider'

const { Row, Col } = Grid
const { Text } = Typography

interface EisenhowerGridProps {
  tasks: Task[]
  onAddTask: () => void
  onSelectTask: (task: Task) => void
  containerWidth: number
}

interface QuadrantCardProps {
  quadrant: 'do-first' | 'schedule' | 'delegate' | 'eliminate'
  tasks: Task[]
  onSelectTask: (task: Task) => void
  zoom: number
}

export function EisenhowerGrid({ tasks, onAddTask, onSelectTask, containerWidth }: EisenhowerGridProps) {
  const [zoom, setZoom] = useState(1)
  // const { } = useResponsive() // Not used in this component

  // Filter tasks by completion status
  const incompleteTasks = tasks.filter(task => !task.completed)

  // Categorize tasks by quadrant
  const categorizedTasks = {
    'do-first': incompleteTasks.filter(task => task.importance >= 6 && task.urgency >= 6),
    'schedule': incompleteTasks.filter(task => task.importance >= 6 && task.urgency < 6),
    'delegate': incompleteTasks.filter(task => task.importance < 6 && task.urgency >= 6),
    'eliminate': incompleteTasks.filter(task => task.importance < 6 && task.urgency < 6),
  }

  const QuadrantCard = ({ quadrant, tasks, onSelectTask, zoom }: QuadrantCardProps) => {
    const getQuadrantInfo = (quadrant: string) => {
      switch (quadrant) {
        case 'do-first':
          return {
            title: 'Do First',
            color: '#ff4757',
            bgColor: '#fff5f5',
            description: 'Urgent & Important',
            icon: <IconFire style={{ color: '#ff4757' }} />,
          }
        case 'schedule':
          return {
            title: 'Schedule',
            color: '#3742fa',
            bgColor: '#f5f6ff',
            description: 'Important, Not Urgent',
            icon: <IconCalendar style={{ color: '#3742fa' }} />,
          }
        case 'delegate':
          return {
            title: 'Delegate',
            color: '#ffa502',
            bgColor: '#fffbf5',
            description: 'Urgent, Not Important',
            icon: <IconUser style={{ color: '#ffa502' }} />,
          }
        case 'eliminate':
          return {
            title: 'Eliminate',
            color: '#747d8c',
            bgColor: '#f8f9fa',
            description: 'Neither Urgent Nor Important',
            icon: <IconClose style={{ color: '#747d8c' }} />,
          }
        default:
          return {
            title: 'Unknown',
            color: '#000',
            bgColor: '#fff',
            description: '',
            icon: null,
          }
      }
    }

    const info = getQuadrantInfo(quadrant)
    const quadrantTasks = tasks

    return (
      <Card
        style={{
          height: 400 * zoom,
          borderColor: info.color,
          backgroundColor: info.bgColor,
          cursor: 'default',
        }}
        title={
          <Space>
            {info.icon}
            <Text style={{ color: info.color, fontWeight: 'bold' }}>{info.title}</Text>
            <Tag color={info.color} size="small">{quadrantTasks.length}</Tag>
          </Space>
        }
      >
        <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
          {info.description}
        </Text>

        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {quadrantTasks.map(task => (
            <Card
              key={task.id}
              size="small"
              style={{
                cursor: 'pointer',
                borderColor: task.type === TaskType.Focused ? '#165DFF' :
                           task.type === TaskType.Admin ? '#00B42A' : '#FF7D00',
                backgroundColor: '#fff',
                transform: `scale(${Math.min(zoom, 1.2)})`,
                transformOrigin: 'top left',
              }}
              onClick={() => onSelectTask(task)}
              hoverable
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{task.name}</Text>
                <Space>
                  <Tag
                    color={task.type === TaskType.Focused ? 'blue' :
                          task.type === TaskType.Admin ? 'green' : 'orange'}
                    size="small"
                  >
                    {task.type}
                  </Tag>
                  <Tag size="small">{task.duration}m</Tag>
                  <Tag color="purple" size="small">I:{task.importance}</Tag>
                  <Tag color="red" size="small">U:{task.urgency}</Tag>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>
    )
  }

  return (
    <div>
      {/* Grid Controls */}
      {containerWidth > 400 && (
        <Card style={{ marginBottom: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button icon={<IconZoomOut />} size="small" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} />
              <Slider
                value={zoom}
                onChange={(val) => setZoom(Array.isArray(val) ? val[0] : val)}
                min={0.5}
                max={2}
                step={0.1}
                style={{ width: containerWidth > 600 ? 120 : 80 }}
                formatTooltip={(val) => `${Math.round(val * 100)}%`}
              />
              <Button icon={<IconZoomIn />} size="small" onClick={() => setZoom(Math.min(2, zoom + 0.1))} />
            </Space>

            <Button type="primary" icon={<IconPlus />} onClick={onAddTask} size="small">
              {containerWidth > 500 ? 'Add Task' : ''}
            </Button>
          </Space>
        </Card>
      )}

      {/* Matrix Grid */}
      <div style={{
        position: 'relative',
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
                  <QuadrantCard
                    quadrant="schedule"
                    tasks={categorizedTasks.schedule}
                    onSelectTask={onSelectTask}
                    zoom={zoom}
                  />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard
                    quadrant="eliminate"
                    tasks={categorizedTasks.eliminate}
                    onSelectTask={onSelectTask}
                    zoom={zoom}
                  />
                </Col>
              </Row>
            </Col>
            <Col span={12}>
              <Row gutter={[24, 24]}>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard
                    quadrant="do-first"
                    tasks={categorizedTasks['do-first']}
                    onSelectTask={onSelectTask}
                    zoom={zoom}
                  />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard
                    quadrant="delegate"
                    tasks={categorizedTasks.delegate}
                    onSelectTask={onSelectTask}
                    zoom={zoom}
                  />
                </Col>
              </Row>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  )
}
