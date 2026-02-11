/**
 * EndeavorList - Displays endeavors with progress indicators
 *
 * Shows all endeavors for the current session with:
 * - Progress bars based on task completion
 * - Status badges (active, paused, completed)
 * - Quick actions (edit, archive)
 * - Cross-endeavor dependency indicators
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Card,
  List,
  Typography,
  Empty,
  Space,
  Tag,
  Button,
  Progress,
  Popconfirm,
  Select,
  Spin,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconPause,
  IconPlayArrow,
  IconCheck,
  IconArchive,
  IconLink,
} from '@arco-design/web-react/icon'
import { Message } from '../common/Message'
import { EndeavorStatus } from '@shared/enums'
import { calculateEndeavorProgress, sortEndeavorsByPriority } from '@shared/endeavor-utils'
import type { EndeavorWithTasks, EndeavorProgress as EndeavorProgressType } from '@shared/types'
import { EndeavorForm } from './EndeavorForm'
import { useEndeavorStore, EndeavorLoadStatus } from '../../store/useEndeavorStore'

const { Title, Text } = Typography

interface EndeavorListProps {
  onSelectEndeavor?: (endeavorId: string) => void
}

const STATUS_COLORS: Record<EndeavorStatus, string> = {
  [EndeavorStatus.Active]: 'arcoblue',
  [EndeavorStatus.Paused]: 'orange',
  [EndeavorStatus.Completed]: 'green',
  [EndeavorStatus.Archived]: 'gray',
}

const STATUS_LABELS: Record<EndeavorStatus, string> = {
  [EndeavorStatus.Active]: 'Active',
  [EndeavorStatus.Paused]: 'Paused',
  [EndeavorStatus.Completed]: 'Completed',
  [EndeavorStatus.Archived]: 'Archived',
}

export function EndeavorList({ onSelectEndeavor }: EndeavorListProps) {
  const [statusFilter, setStatusFilter] = useState<EndeavorStatus | 'all'>('all')
  const [formVisible, setFormVisible] = useState(false)
  const [editingEndeavor, setEditingEndeavor] = useState<EndeavorWithTasks | null>(null)

  const {
    endeavors,
    status,
    loadEndeavors,
    updateEndeavor,
    deleteEndeavor,
  } = useEndeavorStore()

  // Load endeavors on mount
  useEffect(() => {
    loadEndeavors({
      includeArchived: statusFilter === EndeavorStatus.Archived || statusFilter === 'all',
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
  }, [statusFilter, loadEndeavors])

  // Sort endeavors by priority
  const sortedEndeavors = useMemo(() => {
    return sortEndeavorsByPriority(endeavors)
  }, [endeavors])

  // Filter by status if needed
  const filteredEndeavors = useMemo(() => {
    if (statusFilter === 'all') return sortedEndeavors
    return sortedEndeavors.filter((e) => e.status === statusFilter)
  }, [sortedEndeavors, statusFilter])

  const handleStatusChange = async (endeavor: EndeavorWithTasks, newStatus: EndeavorStatus) => {
    try {
      await updateEndeavor(endeavor.id, { status: newStatus })
      Message.success('Endeavor updated')
    } catch (err) {
      Message.error(`Failed to update endeavor: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDelete = async (endeavorId: string) => {
    try {
      await deleteEndeavor(endeavorId)
      Message.success('Endeavor deleted')
    } catch (err) {
      Message.error(`Failed to delete endeavor: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleEdit = (endeavor: EndeavorWithTasks) => {
    setEditingEndeavor(endeavor)
    setFormVisible(true)
  }

  const handleFormClose = () => {
    setFormVisible(false)
    setEditingEndeavor(null)
    loadEndeavors()
  }

  const renderProgress = (endeavor: EndeavorWithTasks) => {
    const progress: EndeavorProgressType = calculateEndeavorProgress(endeavor)

    return (
      <Space direction="vertical" size="mini" style={{ width: '100%' }}>
        <Progress
          percent={progress.percentComplete}
          size="small"
          color={progress.percentComplete === 100 ? 'green' : undefined}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {progress.completedTasks}/{progress.totalTasks} tasks
          {progress.inProgressTasks > 0 && ` (${progress.inProgressTasks} in progress)`}
        </Text>
      </Space>
    )
  }

  const renderEndeavorItem = (endeavor: EndeavorWithTasks) => {
    const priorityScore = endeavor.importance * endeavor.urgency

    return (
      <List.Item
        key={endeavor.id}
        style={{
          padding: 16,
          borderLeft: endeavor.color ? `4px solid ${endeavor.color}` : undefined,
          cursor: 'pointer',
        }}
        onClick={() => onSelectEndeavor?.(endeavor.id)}
        actions={[
          <Button
            key="edit"
            type="text"
            icon={<IconEdit />}
            onClick={(e) => {
              e.stopPropagation()
              handleEdit(endeavor)
            }}
          />,
          endeavor.status === EndeavorStatus.Active ? (
            <Button
              key="pause"
              type="text"
              icon={<IconPause />}
              onClick={(e) => {
                e.stopPropagation()
                handleStatusChange(endeavor, EndeavorStatus.Paused)
              }}
            />
          ) : endeavor.status === EndeavorStatus.Paused ? (
            <Button
              key="resume"
              type="text"
              icon={<IconPlayArrow />}
              onClick={(e) => {
                e.stopPropagation()
                handleStatusChange(endeavor, EndeavorStatus.Active)
              }}
            />
          ) : null,
          endeavor.status !== EndeavorStatus.Completed && (
            <Button
              key="complete"
              type="text"
              icon={<IconCheck />}
              onClick={(e) => {
                e.stopPropagation()
                handleStatusChange(endeavor, EndeavorStatus.Completed)
              }}
            />
          ),
          endeavor.status !== EndeavorStatus.Archived ? (
            <Button
              key="archive"
              type="text"
              icon={<IconArchive />}
              onClick={(e) => {
                e.stopPropagation()
                handleStatusChange(endeavor, EndeavorStatus.Archived)
              }}
            />
          ) : (
            <Popconfirm
              key="delete"
              title="Delete this endeavor?"
              content="This will permanently remove the endeavor. Tasks will not be deleted."
              onOk={(e) => {
                e?.stopPropagation()
                handleDelete(endeavor.id)
              }}
            >
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          ),
        ].filter(Boolean)}
      >
        <List.Item.Meta
          title={
            <Space>
              <Text style={{ fontSize: 16 }}>{endeavor.name}</Text>
              <Tag color={STATUS_COLORS[endeavor.status]} size="small">
                {STATUS_LABELS[endeavor.status]}
              </Tag>
              {priorityScore >= 50 && (
                <Tag color="red" size="small">
                  High Priority
                </Tag>
              )}
              {endeavor.items.some((item) => item.task.dependencies.length > 0) && (
                <Tag icon={<IconLink />} size="small" color="purple">
                  Has Dependencies
                </Tag>
              )}
            </Space>
          }
          description={
            <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
              {endeavor.description && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {endeavor.description}
                </Text>
              )}
              {renderProgress(endeavor)}
              {endeavor.deadline && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Deadline: {new Date(endeavor.deadline).toLocaleDateString()}
                  {endeavor.deadlineType === 'hard' && (
                    <Tag color="red" size="small" style={{ marginLeft: 8 }}>
                      Hard
                    </Tag>
                  )}
                </Text>
              )}
            </Space>
          }
        />
      </List.Item>
    )
  }

  if (status === EndeavorLoadStatus.Loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size={32} />
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title heading={5} style={{ margin: 0 }}>
            Endeavors
          </Title>
          <Space>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Active', value: EndeavorStatus.Active },
                { label: 'Paused', value: EndeavorStatus.Paused },
                { label: 'Completed', value: EndeavorStatus.Completed },
                { label: 'Archived', value: EndeavorStatus.Archived },
              ]}
            />
            <Button type="primary" icon={<IconPlus />} onClick={() => setFormVisible(true)}>
              New Endeavor
            </Button>
          </Space>
        </Space>

        {filteredEndeavors.length === 0 ? (
          <Empty
            description={
              statusFilter === 'all'
                ? 'No endeavors yet. Create one to group related tasks and workflows.'
                : `No ${statusFilter} endeavors found.`
            }
          />
        ) : (
          <List dataSource={filteredEndeavors} render={renderEndeavorItem} bordered={false} />
        )}
      </Space>

      <EndeavorForm
        visible={formVisible}
        onClose={handleFormClose}
        endeavor={editingEndeavor}
      />
    </Card>
  )
}
