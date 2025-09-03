import { Table, Tag, Button, Space, Dropdown, Menu, Typography, Input, Select } from '@arco-design/web-react'
import { IconEdit, IconDelete, IconCheckCircle, IconClockCircle, IconMore } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { useState } from 'react'
import { TaskEdit } from './TaskEdit'
import { logger } from '@shared/logger'

const { Text } = Typography

interface TaskGridViewProps {
  tasks: Task[]
}

export function TaskGridView({ tasks }: TaskGridViewProps) {
  const { updateTask, deleteTask } = useTaskStore()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null)

  const handleToggleComplete = async (task: Task) => {
    try {
      await updateTask(task.id, {
        completed: !task.completed
      })
      Message.success(task.completed ? 'Task marked as incomplete' : 'Task completed!')
    } catch (error) {
      logger.ui.error('Failed to toggle task completion', error)
      Message.error('Failed to update task')
    }
  }

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      Message.success('Task deleted')
    } catch (error) {
      logger.ui.error('Failed to delete task', error)
      Message.error('Failed to delete task')
    }
  }

  const handleEdit = (task: Task) => {
    setSelectedTask(task)
    setEditModalVisible(true)
  }

  const getTaskTypeTag = (type: TaskType) => {
    const typeConfig = {
      [TaskType.Focused]: { color: 'blue', text: 'Focused' },
      [TaskType.Admin]: { color: 'orange', text: 'Admin' },
      [TaskType.Personal]: { color: 'green', text: 'Personal' },
      [TaskType.Mixed]: { color: 'purple', text: 'Mixed' },
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
      render: (name: string, record: Task) => (
        <Text>{name}</Text>
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
        { text: 'Mixed', value: TaskType.Mixed },
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

  return (
    <>
      <Table
        columns={columns}
        data={tasks}
        rowKey="id"
        pagination={{
          pageSize: 20,
          showTotal: true,
          showJumper: true,
          sizeOptions: [10, 20, 50, 100],
        }}
        size="small"
        stripe
        border
        scroll={{ x: true }}
      />
      
      {selectedTask && editModalVisible && (
        <TaskEdit
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