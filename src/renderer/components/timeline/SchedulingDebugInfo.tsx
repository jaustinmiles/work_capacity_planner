import { Card, Typography, Space, Collapse, Tag, Alert, Table } from '@arco-design/web-react'
import { IconExclamationCircle, IconInfoCircle } from '@arco-design/web-react/icon'
import { SchedulingDebugInfo as DebugInfo } from '../../utils/flexible-scheduler'

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
                  columns={[
                    { title: 'Task', dataIndex: 'name' },
                    { title: 'Type', dataIndex: 'type' },
                    { title: 'Duration', dataIndex: 'duration', render: (val) => `${val} min` },
                    { title: 'Reason', dataIndex: 'reason' },
                  ]}
                  data={debugInfo.unscheduledItems}
                  pagination={false}
                  size="small"
                />
              </div>
            )}

            {/* Block Utilization */}
            <div>
              <Title heading={6} style={{ marginBottom: 8 }}>
                Block Utilization
              </Title>
              <Table
                columns={[
                  { title: 'Date', dataIndex: 'date' },
                  { title: 'Block', dataIndex: 'blockId' },
                  { 
                    title: 'Time', 
                    render: (_, record) => `${record.startTime} - ${record.endTime}` 
                  },
                  { 
                    title: 'Focus', 
                    render: (_, record) => {
                      const isFullyUsed = record.focusUsed === record.focusTotal
                      const color = isFullyUsed ? 'green' : record.focusUsed > 0 ? 'blue' : 'gray'
                      return (
                        <Space>
                          <Tag color={color} size="small">
                            {record.focusUsed}/{record.focusTotal}
                          </Tag>
                        </Space>
                      )
                    }
                  },
                  { 
                    title: 'Admin', 
                    render: (_, record) => {
                      const isFullyUsed = record.adminUsed === record.adminTotal
                      const color = isFullyUsed ? 'green' : record.adminUsed > 0 ? 'blue' : 'gray'
                      return (
                        <Space>
                          <Tag color={color} size="small">
                            {record.adminUsed}/{record.adminTotal}
                          </Tag>
                        </Space>
                      )
                    }
                  },
                  {
                    title: 'Status',
                    dataIndex: 'unusedReason',
                    render: (val) => {
                      if (!val) return <Tag color="green">Fully utilized</Tag>
                      if (val.includes('in the past')) return <Tag color="gray">{val}</Tag>
                      if (val.includes('started at')) return <Tag color="blue">{val}</Tag>
                      return <Tag color="orange">{val}</Tag>
                    }
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