import { useState, useEffect, useCallback } from 'react'
import { Typography, Card, Table, Select, Button, Space, Tag, Input, Empty, Spin } from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'
import { formatDistanceToNow } from 'date-fns'
import { getDatabase } from '../../services/database'
import type { LogEntry, SessionLogSummary, LogLevel } from '@shared/log-types'

const { Title, Text } = Typography

interface LogViewerProps {
  onClose: () => void
}

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'red',
  WARN: 'orange',
  INFO: 'blue',
  DEBUG: 'gray',
}

export function LogViewer({ onClose: _onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [sessions, setSessions] = useState<SessionLogSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<{
    sessionId: string | undefined
    level: LogLevel | undefined
    search: string
  }>({
    sessionId: undefined,
    level: undefined,
    search: '',
  })

  const loadLogs = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const db = getDatabase()
      const result = await db.getSessionLogs({
        sessionId: filters.sessionId,
        level: filters.level,
        limit: 200,
      })
      setLogs(result)
    } catch (error) {
      // Log viewer is dev-only, so console.error is acceptable here
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }, [filters.sessionId, filters.level])

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const db = getDatabase()
      const result = await db.getLoggedSessions()
      setSessions(result)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
    void loadLogs()
  }, [loadSessions, loadLogs])

  const filteredLogs = filters.search
    ? logs.filter(log =>
        log.message.toLowerCase().includes(filters.search.toLowerCase()) ||
        log.context.toLowerCase().includes(filters.search.toLowerCase()),
      )
    : logs

  const parseContext = (contextStr: string): string => {
    try {
      const parsed = JSON.parse(contextStr)
      if (Object.keys(parsed).length === 0) return ''
      return JSON.stringify(parsed, null, 2)
    } catch {
      return contextStr
    }
  }

  const columns = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      width: 120,
      render: (date: string): React.ReactNode => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </Text>
      ),
    },
    {
      title: 'Level',
      dataIndex: 'level',
      width: 80,
      render: (level: string): React.ReactNode => (
        <Tag color={LEVEL_COLORS[level] || 'default'}>{level}</Tag>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 80,
      render: (source: string): React.ReactNode => <Tag>{source}</Tag>,
    },
    {
      title: 'Message',
      dataIndex: 'message',
      render: (message: string, record: LogEntry): React.ReactNode => {
        const contextDisplay = parseContext(record.context)
        return (
          <div>
            <Text>{message}</Text>
            {contextDisplay && (
              <pre style={{ fontSize: 11, marginTop: 4, color: '#666', maxHeight: 60, overflow: 'auto' }}>
                {contextDisplay}
              </pre>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <Card
      title={<Title heading={6}>Log Viewer</Title>}
      extra={
        <Button icon={<IconRefresh />} onClick={() => void loadLogs()} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        {/* Filters */}
        <Space wrap>
          <Select
            placeholder="All Sessions"
            allowClear
            style={{ width: 200 }}
            value={filters.sessionId}
            onChange={(value: string | undefined) => setFilters(f => ({ ...f, sessionId: value }))}
          >
            {sessions.map(s => (
              <Select.Option key={s.sessionId} value={s.sessionId}>
                {s.sessionId.slice(0, 8)}... ({s.logCount} logs)
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="All Levels"
            allowClear
            style={{ width: 120 }}
            value={filters.level}
            onChange={(value: string | undefined) => setFilters(f => ({ ...f, level: value as LogLevel | undefined }))}
          >
            <Select.Option value="ERROR">ERROR</Select.Option>
            <Select.Option value="WARN">WARN</Select.Option>
            <Select.Option value="INFO">INFO</Select.Option>
            <Select.Option value="DEBUG">DEBUG</Select.Option>
          </Select>
          <Input.Search
            placeholder="Search logs..."
            style={{ width: 200 }}
            value={filters.search}
            onChange={(value: string) => setFilters(f => ({ ...f, search: value }))}
          />
        </Space>

        {/* Log Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size={32} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <Empty description="No logs found" />
        ) : (
          <Table
            columns={columns}
            data={filteredLogs}
            rowKey="id"
            pagination={{ pageSize: 50 }}
            size="small"
          />
        )}
      </Space>
    </Card>
  )
}
