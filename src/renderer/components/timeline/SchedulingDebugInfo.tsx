import React from 'react'
import { Card, Typography, Space, Collapse, Tag, Alert, Table } from '@arco-design/web-react'
import { IconExclamationCircle, IconInfoCircle } from '@arco-design/web-react/icon'

// Local type definition for debug info
interface DebugInfo {
  unscheduledItems: Array<{
    id: string
    name: string
    duration: number
    type: string
    reason: string
    priorityBreakdown?: {
      total: number
      eisenhower: number
      deadlineBoost?: number
      asyncBoost?: number
      cognitiveMatch?: number
      contextSwitchPenalty?: number
      workflowDepthBonus?: number
    }
  }>
  scheduledItems?: Array<{
    id: string
    name: string
    type: string
    startTime: string
    duration: number
    priority?: number
    priorityBreakdown?: {
      total: number
      eisenhower: number
      deadlineBoost?: number
      asyncBoost?: number
      cognitiveMatch?: number
      contextSwitchPenalty?: number
      workflowDepthBonus?: number
    }
  }>
  warnings: string[]
  unusedCapacity: number
  blockUtilization: Array<{
    date: string
    blockId?: string
    blockStart: string
    blockEnd: string
    startTime?: string
    endTime?: string
    type: string
    capacity: number
    used: number
    utilizationPercent: number
    unusedReason?: string
  }>
}

const { Title, Text } = Typography

interface SchedulingDebugInfoProps {
  debugInfo: DebugInfo | null
}

export const SchedulingDebugInfo: React.FC<SchedulingDebugInfoProps> = ({ debugInfo }) => {
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
                Block Utilization (Current & Next Day)
              </Title>
              <Table
                rowKey={(record) => `${record.date}-${record.blockId || record.blockStart}`}
                columns={[
                  { title: 'Date', dataIndex: 'date' },
                  { title: 'Block', dataIndex: 'blockId' },
                  {
                    title: 'Time',
                    render: (_, record) => `${record.startTime || record.blockStart} - ${record.endTime || record.blockEnd}`,
                  },
                  {
                    title: 'Capacity Used',
                    render: (_, record) => {
                      const used = record.used ?? 0
                      const total = record.capacity ?? 0
                      if (total === 0) return '-'
                      const utilizationPercent = Math.round((used / total) * 100)
                      const isFullyUsed = used === total
                      const color = isFullyUsed ? 'green' : used > 0 ? 'blue' : 'gray'
                      return (
                        <Space>
                          <Tag color={color} size="small">
                            {used}/{total} ({utilizationPercent}%)
                          </Tag>
                        </Space>
                      )
                    },
                  },
                  {
                    title: 'Status',
                    dataIndex: 'unusedReason',
                    render: (val, record) => {
                      // Check if block is actually utilized
                      const totalUsed = record.used || 0
                      const totalCapacity = record.capacity || 0

                      if (totalUsed === 0 && totalCapacity > 0) {
                        return <Tag color="yellow">Not utilized</Tag>
                      }
                      if (totalUsed >= totalCapacity && totalCapacity > 0) {
                        return <Tag color="green">Fully utilized</Tag>
                      }
                      if (!val && totalUsed > 0) {
                        return <Tag color="green">Partially utilized</Tag>
                      }
                      if (val?.includes('in the past')) return <Tag color="gray">{val}</Tag>
                      if (val?.includes('started at')) return <Tag color="blue">{val}</Tag>
                      return <Tag color="orange">{val || 'Available'}</Tag>
                    },
                  },
                ]}
                data={(() => {
                  // Filter to only show current and next day
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const tomorrow = new Date(today)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  const dayAfter = new Date(tomorrow)
                  dayAfter.setDate(dayAfter.getDate() + 1)

                  return debugInfo.blockUtilization.filter(block => {
                    const blockDate = new Date(block.date)
                    blockDate.setHours(0, 0, 0, 0)
                    return blockDate >= today && blockDate < dayAfter
                  })
                })()}
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
