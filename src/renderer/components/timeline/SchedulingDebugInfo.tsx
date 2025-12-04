import React from 'react'
import { Card, Typography, Space, Collapse, Tag, Alert, Table } from '@arco-design/web-react'
import { IconExclamationCircle, IconInfoCircle } from '@arco-design/web-react/icon'
import type { SchedulingDebugInfo } from '@shared/unified-scheduler'
import { getBlockTypeDisplayColor } from '@shared/user-task-types'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'

const { Title, Text } = Typography

interface SchedulingDebugPanelProps {
  debugInfo: SchedulingDebugInfo | null
}

export const SchedulingDebugPanel: React.FC<SchedulingDebugPanelProps> = ({ debugInfo }) => {
  const userTypes = useSortedUserTaskTypes()

  if (!debugInfo) return null

  const hasIssues = debugInfo.unscheduledItems.length > 0 || debugInfo.warnings.length > 0

  return (
    <Card style={{ marginTop: 16 }}>
      <Collapse
        defaultActiveKey={hasIssues ? ['debug'] : []}
        expandIconPosition="right"
      >
        <Collapse.Item
          name="debug"
          key="debug"
          header={
            <Space>
              {hasIssues ? (
                <IconExclamationCircle style={{ color: '#ff7d00' }} />
              ) : (
                <IconInfoCircle style={{ color: '#3370ff' }} />
              )}
              <Text>Scheduling Debug Info</Text>
              {hasIssues && (
                <Tag color="orange">
                  {debugInfo.unscheduledItems.length} unscheduled items
                </Tag>
              )}
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Warnings */}
            {debugInfo.warnings.length > 0 && (
              <Alert
                type="warning"
                content={
                  <Space direction="vertical">
                    {debugInfo.warnings.map((warning, index) => (
                      <Text key={index}>{warning}</Text>
                    ))}
                  </Space>
                }
              />
            )}

            {/* Unscheduled Items */}
            {debugInfo.unscheduledItems.length > 0 && (
              <div>
                <Title heading={6} style={{ marginBottom: 8 }}>
                  Unscheduled Items ({debugInfo.unscheduledItems.length})
                </Title>
                <Table
                  rowKey="id"
                  columns={[
                    { title: 'Task', dataIndex: 'name' },
                    { title: 'Type', dataIndex: 'type' },
                    { title: 'Duration', dataIndex: 'duration', render: (val) => `${val} min` },
                    {
                      title: 'Priority',
                      render: (_, record) => {
                        if (!record.priorityBreakdown) return '-'
                        const p = record.priorityBreakdown
                        return (
                          <div style={{ fontSize: 11 }}>
                            <div>Total: {Math.round(p.total)}</div>
                            <div style={{ color: '#666' }}>
                              E:{Math.round(p.eisenhower)}
                              {p.deadlineBoost !== undefined && p.deadlineBoost > 0 && ` D:+${Math.round(p.deadlineBoost)}`}
                              {p.asyncBoost !== undefined && p.asyncBoost > 0 && ` A:+${Math.round(p.asyncBoost)}`}
                              {p.cognitiveMatch !== undefined && p.cognitiveMatch !== 0 && ` C:${p.cognitiveMatch > 0 ? '+' : ''}${Math.round(p.cognitiveMatch)}`}
                              {p.contextSwitchPenalty !== undefined && p.contextSwitchPenalty < 0 && ` S:${Math.round(p.contextSwitchPenalty)}`}
                              {p.workflowDepthBonus !== undefined && p.workflowDepthBonus > 0 && ` W:+${Math.round(p.workflowDepthBonus)}`}
                            </div>
                          </div>
                        )
                      },
                    },
                    { title: 'Reason', dataIndex: 'reason' },
                  ]}
                  data={[...debugInfo.unscheduledItems].sort((a, b) => {
                    const aPriority = a.priorityBreakdown?.total ?? 0
                    const bPriority = b.priorityBreakdown?.total ?? 0
                    return bPriority - aPriority
                  })}
                  pagination={false}
                  size="small"
                />
              </div>
            )}

            {/* Scheduled Items Priority Breakdown */}
            {debugInfo.scheduledItems && debugInfo.scheduledItems.length > 0 && (
              <div>
                <Title heading={6} style={{ marginBottom: 8 }}>
                  Scheduled Items Priority Analysis (First 10 by Schedule Order)
                </Title>
                <Table
                  rowKey="id"
                  columns={[
                    { title: 'Task', dataIndex: 'name' },
                    { title: 'Type', dataIndex: 'type' },
                    { title: 'Time', dataIndex: 'startTime',
                      render: (val) => val ? new Date(val).toLocaleTimeString() : '-' },
                    { title: 'Duration', dataIndex: 'duration', render: (val) => `${val} min` },
                    {
                      title: 'Priority Breakdown',
                      render: (_, record) => {
                        if (!record.priorityBreakdown) return <Tag>Priority: {record.priority || 0}</Tag>
                        const p = record.priorityBreakdown
                        return (
                          <div style={{ fontSize: 11 }}>
                            <div>Total: {Math.round(p.total)}</div>
                            <div style={{ color: '#666' }}>
                              E:{Math.round(p.eisenhower)}
                              {p.deadlineBoost !== undefined && p.deadlineBoost > 0 && ` D:+${Math.round(p.deadlineBoost)}`}
                              {p.asyncBoost !== undefined && p.asyncBoost > 0 && ` A:+${Math.round(p.asyncBoost)}`}
                              {p.cognitiveMatch !== undefined && p.cognitiveMatch !== 0 && ` C:${p.cognitiveMatch > 0 ? '+' : ''}${Math.round(p.cognitiveMatch)}`}
                              {p.contextSwitchPenalty !== undefined && p.contextSwitchPenalty < 0 && ` S:${Math.round(p.contextSwitchPenalty)}`}
                              {p.workflowDepthBonus !== undefined && p.workflowDepthBonus > 0 && ` W:+${Math.round(p.workflowDepthBonus)}`}
                            </div>
                          </div>
                        )
                      },
                    },
                  ]}
                  data={debugInfo.scheduledItems}
                  pagination={false}
                  size="small"
                  scroll={{ y: 200 }}
                />
              </div>
            )}

            {/* Block Utilization */}
            <div>
              <Title heading={6} style={{ marginBottom: 8 }}>
                Block Utilization (All Blocks)
              </Title>
              <Table
                rowKey={(record) => `${record.date}-${record.blockId}`}
                columns={[
                  { title: 'Date', dataIndex: 'date' },
                  {
                    title: 'Block ID',
                    dataIndex: 'blockId',
                    render: (val) => val?.substring(0, 8) || val,
                  },
                  {
                    title: 'Time',
                    render: (_, record) => `${record.startTime} - ${record.endTime}`,
                  },
                  {
                    title: 'Type',
                    dataIndex: 'blockType',
                    render: (val) => {
                      // Get user type name if available, otherwise use the block type value
                      const userType = userTypes.find(t => t.id === val)
                      const displayName = userType ? `${userType.emoji} ${userType.name}` : val
                      return <Tag color={getBlockTypeDisplayColor(val, userTypes)}>{displayName}</Tag>
                    },
                  },
                  {
                    title: 'Capacity',
                    render: (_, record) => {
                      if (record.capacityByType) {
                        const parts = Object.entries(record.capacityByType)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k.slice(0, 1).toUpperCase()}:${v}`)
                        if (parts.length > 0) return parts.join(' ')
                      }
                      return record.capacity || 0
                    },
                  },
                  {
                    title: 'Used',
                    render: (_, record) => {
                      const used = record.used ?? 0
                      const total = record.capacity ?? 0

                      if (record.usedByType) {
                        const parts = Object.entries(record.usedByType)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k.slice(0, 1).toUpperCase()}:${v}`)
                        const breakdown = parts.join(' ')
                        const percent = total > 0 ? Math.round((used / total) * 100) : 0
                        const color = percent >= 80 ? 'green' : percent > 0 ? 'blue' : 'gray'
                        return <Tag color={color}>{breakdown || `${used}/${total}`} ({percent}%)</Tag>
                      }

                      const percent = total > 0 ? Math.round((used / total) * 100) : 0
                      const color = percent >= 80 ? 'green' : percent > 0 ? 'blue' : 'gray'
                      return <Tag color={color}>{used}/{total} ({percent}%)</Tag>
                    },
                  },
                  {
                    title: 'Status',
                    render: (_, record) => {
                      const totalUsed = record.used || 0
                      const totalCapacity = record.capacity || 0

                      if (record.isCurrent) return <Tag color="cyan">Current</Tag>
                      if (record.reasonNotFilled?.length) {
                        return <Tag color="orange">{record.reasonNotFilled[0]}</Tag>
                      }
                      if (totalUsed === 0 && totalCapacity > 0) {
                        return <Tag color="yellow">Empty</Tag>
                      }
                      if (totalUsed >= totalCapacity && totalCapacity > 0) {
                        return <Tag color="green">Full</Tag>
                      }
                      if (totalUsed > 0) {
                        return <Tag color="blue">Partial</Tag>
                      }
                      return <Tag>-</Tag>
                    },
                  },
                ]}
                data={debugInfo.blockUtilization}
                pagination={false}
                size="small"
                scroll={{ y: 300 }}
              />
            </div>
          </Space>
        </Collapse.Item>
      </Collapse>
    </Card>
  )
}
