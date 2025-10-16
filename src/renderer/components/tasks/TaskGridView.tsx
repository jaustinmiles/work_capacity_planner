import { Table, Tag, Button, Space, Dropdown, Menu, Typography, Input, Select, Card } from '@arco-design/web-react'
import { IconEdit, IconDelete, IconCheckCircle, IconClockCircle, IconMore } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { useState, useEffect } from 'react'
import { UnifiedTaskEdit } from './UnifiedTaskEdit'
import { logger } from '@/logger'


const { Text } = Typography

interface TaskGridViewProps {
  tasks: Task[]
}

export function TaskGridView({ tasks }: TaskGridViewProps) {
  const { updateTask, deleteTask } = useTaskStore()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null)

  // Responsive layout detection
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)
  const isNarrowScreen = screenWidth < 600 // Only use cards for truly narrow screens (phones)

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleToggleComplete = async (task: Task) => {
    try {
      await updateTask(task.id, {
        completed: !task.completed,
      })
      const _newStatus = !task.completed ? 'completed' : 'incomplete'
      logger.ui.info('Task completion toggled', {})
    LOGGER_REMOVED: undefined
      Message.success(task.completed ? 'Task marked as incomplete' : 'Task completed!')
    } catch (_error) {
      logger.ui.error('Failed to toggle task completion', _error)
      Message.error('Failed to update task')
    }
  }

  const handleDelete = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      await deleteTask(taskId)
      logger.ui.info('Task deleted', {})
        taskId,
        taskName: task?.name || 'Unknown',
      }, 'task-delete-success')
      Message.success('Task deleted')
    } catch (error) {
      logger.ui.error('Failed to delete task', {})
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-delete-error')
      Message.error('Failed to delete task')
    }
  }

  const handleEdit = (task: Task) => {
    logger.ui.info('Task edit modal opened', {})
    LOGGER_REMOVED: undefined
    setSelectedTask(task)
    setEditModalVisible(true)
  }

  const getTaskTypeTag = (type: TaskType) => {
    const typeConfig = {
      [TaskType.Focused]: { color: 'blue', text: 'Focused' },
      [TaskType.Admin]: { color: 'orange', text: 'Admin' },
      [TaskType.Personal]: { color: 'green', text: 'Personal' },
    }
    const config = typeConfig[type] || { color: 'gray', text: type }
    return <Tag color={config.color} size="small">{config.text}</Tag>
  }

  const getStatusIcon = (task: Task) => {
    if (task.completed) {
      return <IconCheckCircle style={{ color: '#00b42a' }} />
    }
    return <IconClockCircle style={{ color: '#86909c' }} />
  }

  const getPriorityScore = (importance: number, urgency: number) => {
    return importance * urgency
  }

  const columns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 60,
      align: 'center' as const,
      render: (_: any, record: Task) => getStatusIcon(record),
      sorter: (a: Task, b: Task) => Number(a.completed) - Number(b.completed),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200, // Set fixed width to prevent excessive expansion
      ellipsis: true,
      sorter: (a: Task, b: Task) => a.name.localeCompare(b.name),
      filterIcon: <IconMore />,
      filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
        return (
          <div className="arco-table-custom-filter" style={{ padding: 8 }}>
            <Input.Search
              placeholder="Search name..."
              value={filterKeys?.[0] || ''}
              onChange={(value) => setFilterKeys(value ? [value] : [])}
              onSearch={() => confirm()}
              style={{ width: 200 }}
            />
          </div>
        )
      },
      onFilter: (value: string, record: Task) => {
        return record.name.toLowerCase().includes(value.toLowerCase())
      },
      render: (name: string) => (
        <Text
          style={{
            maxWidth: 200, // Constrain name width
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.2, // Prevent excessive line height
          }}
          title={name} // Show full name on hover
        >
          {name}
        </Text>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: TaskType) => getTaskTypeTag(type),
      filters: [
        { text: 'Focused', value: TaskType.Focused },
        { text: 'Admin', value: TaskType.Admin },
        { text: 'Personal', value: TaskType.Personal },
      ],
      onFilter: (value: TaskType, record: Task) => record.type === value,
      sorter: (a: Task, b: Task) => a.type.localeCompare(b.type),
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      sorter: (a: Task, b: Task) => a.duration - b.duration,
      render: (duration: number) => {
        const hours = Math.floor(duration / 60)
        const minutes = duration % 60
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
      },
    },
    {
      title: 'Importance',
      dataIndex: 'importance',
      key: 'importance',
      width: 100,
      align: 'center' as const,
      sorter: (a: Task, b: Task) => a.importance - b.importance,
      render: (value: number, record: Task) => {
        const isEditing = editingCell?.taskId === record.id && editingCell?.field === 'importance'

        if (isEditing) {
          return (
            <Select
              defaultValue={value}
              onBlur={() => setEditingCell(null)}
              onChange={(newValue) => {
                if (newValue !== value) {
                  logger.ui.info('Task importance updated inline', {})
    LOGGER_REMOVED: undefined
                  updateTask(record.id, { importance: newValue })
                }
                setEditingCell(null)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 80 }}
              size="small"
            >
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <Select.Option key={n} value={n}>{n}/10</Select.Option>
              ))}
            </Select>
          )
        }

        return (
          <Tag
            color={value >= 7 ? 'red' : value >= 4 ? 'orange' : 'gray'}
            onClick={() => setEditingCell({ taskId: record.id, field: 'importance' })}
            style={{ cursor: 'pointer' }}
          >
            {value}/10
          </Tag>
        )
      },
    },
    {
      title: 'Urgency',
      dataIndex: 'urgency',
      key: 'urgency',
      width: 100,
      align: 'center' as const,
      sorter: (a: Task, b: Task) => a.urgency - b.urgency,
      render: (value: number, record: Task) => {
        const isEditing = editingCell?.taskId === record.id && editingCell?.field === 'urgency'

        if (isEditing) {
          return (
            <Select
              defaultValue={value}
              onBlur={() => setEditingCell(null)}
              onChange={(newValue) => {
                if (newValue !== value) {
                  logger.ui.info('Task urgency updated inline', {})
    LOGGER_REMOVED: undefined
                  updateTask(record.id, { urgency: newValue })
                }
                setEditingCell(null)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 80 }}
              size="small"
            >
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <Select.Option key={n} value={n}>{n}/10</Select.Option>
              ))}
            </Select>
          )
        }

        return (
          <Tag
            color={value >= 7 ? 'red' : value >= 4 ? 'orange' : 'gray'}
            onClick={() => setEditingCell({ taskId: record.id, field: 'urgency' })}
            style={{ cursor: 'pointer' }}
          >
            {value}/10
          </Tag>
        )
      },
    },
    {
      title: 'Cognitive',
      dataIndex: 'cognitiveComplexity',
      key: 'cognitiveComplexity',
      width: 100,
      align: 'center' as const,
      sorter: (a: Task, b: Task) => (a.cognitiveComplexity || 0) - (b.cognitiveComplexity || 0),
      render: (value: number | undefined, record: Task) => {
        const isEditing = editingCell?.taskId === record.id && editingCell?.field === 'cognitive'
        const displayValue = value || 3

        if (isEditing) {
          return (
            <Select
              defaultValue={displayValue}
              onBlur={() => setEditingCell(null)}
              onChange={(newValue) => {
                if (newValue !== displayValue) {
                  logger.ui.info('Task cognitive complexity updated inline', {})
    LOGGER_REMOVED: undefined
                  updateTask(record.id, { cognitiveComplexity: newValue })
                }
                setEditingCell(null)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 80 }}
              size="small"
            >
              <Select.Option value={1}>Low</Select.Option>
              <Select.Option value={2}>Med-</Select.Option>
              <Select.Option value={3}>Med</Select.Option>
              <Select.Option value={4}>Med+</Select.Option>
              <Select.Option value={5}>High</Select.Option>
            </Select>
          )
        }

        const labels = { 1: 'Low', 2: 'Med-', 3: 'Med', 4: 'Med+', 5: 'High' }
        const colors = { 1: 'green', 2: 'cyan', 3: 'blue', 4: 'orange', 5: 'red' }

        return (
          <Tag
            color={colors[displayValue as keyof typeof colors] || 'gray'}
            onClick={() => setEditingCell({ taskId: record.id, field: 'cognitive' })}
            style={{ cursor: 'pointer' }}
          >
            {labels[displayValue as keyof typeof labels] || 'Med'}
          </Tag>
        )
      },
    },
    {
      title: 'Priority',
      key: 'priority',
      width: 100,
      align: 'center' as const,
      sorter: (a: Task, b: Task) => {
        const priorityA = getPriorityScore(a.importance, a.urgency)
        const priorityB = getPriorityScore(b.importance, b.urgency)
        return priorityB - priorityA
      },
      render: (_: any, record: Task) => {
        const score = getPriorityScore(record.importance, record.urgency)
        let color = 'gray'
        if (score >= 64) color = 'red'
        else if (score >= 36) color = 'orange'
        else if (score >= 16) color = 'blue'

        return <Tag color={color}>{score}</Tag>
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: Task) => (
        <Space size="mini">
          <Button
            size="mini"
            type={record.completed ? 'outline' : 'primary'}
            icon={record.completed ? <IconClockCircle /> : <IconCheckCircle />}
            onClick={() => handleToggleComplete(record)}
          />
          <Dropdown
            droplist={
              <Menu>
                <Menu.Item key="edit" onClick={() => handleEdit(record)}>
                  <IconEdit /> Edit
                </Menu.Item>
                <Menu.Item key="delete" onClick={() => handleDelete(record.id)}>
                  <IconDelete /> Delete
                </Menu.Item>
              </Menu>
            }
            trigger="click"
            position="br"
          >
            <Button size="mini" icon={<IconMore />} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  // Responsive card component for narrow screens
  const renderTaskCard = (task: Task) => (
    <Card key={task.id} style={{ marginBottom: 8 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Task name and status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.name}
          </Text>
          {getStatusIcon(task)}
        </div>

        {/* Key info in compact format */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Tag>{task.type}</Tag>
          <Tag>{task.duration}m</Tag>
          <Tag color="blue">{task.importance}/{task.urgency}</Tag>
          <Tag color="orange">P{task.importance * task.urgency}</Tag>
        </div>

        {/* Actions */}
        <Space>
          <Button size="small" icon={<IconEdit />} onClick={() => handleEdit(task)}>Edit</Button>
          <Button
            size="small"
            type={task.completed ? 'default' : 'primary'}
            icon={<IconCheckCircle />}
            onClick={() => handleToggleComplete(task)}
          >
            {task.completed ? 'Reopen' : 'Complete'}
          </Button>
        </Space>
      </Space>
    </Card>
  )

  return (
    <>
      {isNarrowScreen ? (
        // Card layout for narrow screens - PREVENTS TABLE CATASTROPHE
        <div style={{ minWidth: 300 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {tasks.map(renderTaskCard)}
          </Space>
        </div>
      ) : (
        // Table layout for wide screens with responsive columns
        <Table
          columns={screenWidth < 900 ? columns.filter(col =>
            // Hide less important columns on smaller tablets to fit better
            !['cognitiveComplexity', 'notes'].includes(col.key as string),
          ) : columns}
          data={tasks}
          rowKey="id"
          pagination={{
            pageSize: 20,
            showTotal: true,
            showJumper: true,
            sizeOptions: [10, 20, 50, 100],
          }}
          size={screenWidth < 800 ? 'mini' : 'small'} // Smaller table on tablets
          stripe
          border
          scroll={{ x: true, y: 400 }} // Horizontal scroll + vertical for space
          style={{
            minWidth: 500, // Ensure table has minimum usable width
          }}
        />
      )}

      {selectedTask && editModalVisible && (
        <UnifiedTaskEdit
          task={selectedTask}
          onClose={() => {
            setEditModalVisible(false)
            setSelectedTask(null)
          }}
          startInEditMode={true}
        />
      )}
    </>
  )
}
