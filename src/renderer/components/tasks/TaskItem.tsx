import React, { useState } from 'react'
import { Space, Typography, Tag, Checkbox, Button, Input, Popconfirm, Tooltip, Badge, Modal } from '@arco-design/web-react'
import { IconEdit, IconDelete, IconClockCircle, IconCalendar, IconExclamationCircle } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskEdit } from './TaskEdit'

const { Text } = Typography

interface TaskItemProps {
  task: Task
}

export function TaskItem({ task }: TaskItemProps) {
  const { toggleTaskComplete, deleteTask, selectTask, updateTask } = useTaskStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(task.name)
  const [showEditModal, setShowEditModal] = useState(false)

  const priorityScore = task.importance * task.urgency
  const priorityColor = priorityScore >= 64 ? 'red' :
                       priorityScore >= 36 ? 'orange' :
                       'green'

  const priorityStatus = priorityScore >= 64 ? 'High Priority' :
                        priorityScore >= 36 ? 'Medium Priority' :
                        'Low Priority'

  const handleSave = async () => {
    if (editedName.trim()) {
      try {
        await updateTask(task.id, { name: editedName.trim() })
        setIsEditing(false)
      } catch (error) {
        // Error already handled by store
      }
    }
  }

  const handleCancel = () => {
    setEditedName(task.name)
    setIsEditing(false)
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  return (
    <div
      style={{
        padding: '16px',
        background: task.completed ? '#F7F8FA' : '#fff',
        borderRadius: '8px',
        border: '1px solid #E5E8EF',
        transition: 'all 0.2s',
        opacity: task.completed ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!task.completed) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
          e.currentTarget.style.borderColor = '#C9CDD4'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = '#E5E8EF'
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <Space align="start">
          <Checkbox
            checked={task.completed}
            onChange={() => {
              toggleTaskComplete(task.id).catch(console.error)
            }}
            style={{ marginTop: 2 }}
          />

          <div style={{ flex: 1 }}>
            {isEditing ? (
              <Space>
                <Input
                  value={editedName}
                  onChange={setEditedName}
                  onPressEnter={handleSave}
                  style={{ width: 300 }}
                  autoFocus
                />
                <Button type="primary" size="small" onClick={handleSave}>
                  Save
                </Button>
                <Button size="small" onClick={handleCancel}>
                  Cancel
                </Button>
              </Space>
            ) : (
              <>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: task.completed ? 'line-through' : 'none',
                  }}
                  onClick={() => selectTask(task.id)}
                  className="hover:text-blue-600"
                >
                  {task.name}
                </Text>

                <div style={{ marginTop: 8 }}>
                  <Space size="medium" wrap>
                    <Tag
                      icon={<IconClockCircle />}
                      color="arcoblue"
                      size="small"
                    >
                      {formatDuration(task.duration)}
                    </Tag>

                    <Tooltip content={`Importance: ${task.importance}, Urgency: ${task.urgency}`}>
                      <Tag
                        icon={<IconExclamationCircle />}
                        color={priorityColor}
                        size="small"
                      >
                        {priorityStatus} ({priorityScore})
                      </Tag>
                    </Tooltip>

                    <Tag size="small" color="gray">
                      {task.type === 'focused' ? 'Focused Work' : 'Admin/Meeting'}
                    </Tag>

                    {task.asyncWaitTime > 0 && (
                      <Tag
                        icon={<IconCalendar />}
                        color="orange"
                        size="small"
                      >
                        Wait: {formatDuration(task.asyncWaitTime)}
                      </Tag>
                    )}
                  </Space>
                </div>

                {task.notes && (
                  <Text
                    type="secondary"
                    style={{
                      display: 'block',
                      marginTop: 8,
                      fontSize: 14,
                    }}
                  >
                    {task.notes}
                  </Text>
                )}
              </>
            )}
          </div>
        </Space>

        <Space>
          {!task.completed && (
            <Tooltip content="Edit task">
              <Button
                type="text"
                size="small"
                icon={<IconEdit />}
                onClick={() => setShowEditModal(true)}
              />
            </Tooltip>
          )}

          <Popconfirm
            title="Delete Task"
            content="Are you sure you want to delete this task?"
            onOk={() => {
              deleteTask(task.id).catch(console.error)
            }}
            okText="Delete"
            okButtonProps={{ status: 'danger' }}
          >
            <Tooltip content="Delete task">
              <Button
                type="text"
                size="small"
                status="danger"
                icon={<IconDelete />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      </Space>

      {/* Edit Modal */}
      <Modal
        title="Edit Task"
        visible={showEditModal}
        onCancel={() => setShowEditModal(false)}
        footer={null}
        style={{ width: 800 }}
      >
        <TaskEdit
          task={task}
          onClose={() => setShowEditModal(false)}
        />
      </Modal>
    </div>
  )
}
