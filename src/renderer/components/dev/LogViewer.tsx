import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Space, Typography, Table, Tag, Select, Input, Card, Badge, Switch } from '@arco-design/web-react'
import { IconRefresh, IconDelete, IconDownload, IconSearch } from '@arco-design/web-react/icon'
import { useLoggerContext } from '../../../logging/index.renderer'
import { LogEntry, LogLevel } from '../../../logging/types'

const { Text } = Typography
const { Search } = Input

interface LogViewerProps {
  onClose: () => void
}

// Color mapping for log levels
const levelColors: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'red',
  [LogLevel.WARN]: 'orange',
  [LogLevel.INFO]: 'blue',
  [LogLevel.DEBUG]: 'gray',
  [LogLevel.TRACE]: 'default',
}

// Format timestamp for display
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

export function LogViewer(_props: LogViewerProps) {
  const loggerContext = useLoggerContext()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all')
  const [searchText, setSearchText] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [showDetails, setShowDetails] = useState(true)
  const [hiddenPatterns, setHiddenPatterns] = useState<Set<string>>(new Set())
  const [showHiddenCount] = useState(true)

  // Load logs from ring buffer
  const loadLogs = useCallback(() => {
    const entries = loggerContext.dumpBuffer()
    setLogs(entries)
  }, [loggerContext])

  // Generate pattern key for error/log grouping
  const getPatternKey = useCallback((log: LogEntry): string => {
    // For errors, group by error message pattern
    if (log.error) {
      // Remove dynamic parts like IDs, timestamps, etc.
      return log.error.message
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
        .replace(/\d+/g, 'NUM')
    }
    // For regular logs, group by message pattern
    return log.message
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
      .replace(/\d+/g, 'NUM')
  }, [])

  // Count hidden logs by pattern
  const hiddenCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    logs.forEach(log => {
      const pattern = getPatternKey(log)
      if (hiddenPatterns.has(pattern)) {
        counts[pattern] = (counts[pattern] || 0) + 1
      }
    })
    return counts
  }, [logs, hiddenPatterns, getPatternKey])

  // Filter logs based on level, search, and hidden patterns
  useEffect(() => {
    let filtered = [...logs]

    // Filter by level
    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel)
    }

    // Filter by search text
    if (searchText) {
      const search = searchText.toLowerCase()
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(search) ||
        JSON.stringify(log.data).toLowerCase().includes(search) ||
        log.error?.message?.toLowerCase().includes(search) ||
        log.context?.source?.file?.toLowerCase().includes(search),
      )
    }

    // Filter out hidden patterns completely
    if (hiddenPatterns.size > 0) {
      filtered = filtered.filter(log => {
        const pattern = getPatternKey(log)
        return !hiddenPatterns.has(pattern)
      })
    }

    setFilteredLogs(filtered)
  }, [logs, selectedLevel, searchText, hiddenPatterns, getPatternKey])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(loadLogs, 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadLogs])

  // Initial load
  useEffect(() => {
    loadLogs()

    // Test log to verify logging is working
    const logger = loggerContext.logger
    logger.info('[LogViewer] Log viewer initialized')

    // Load logs again after a short delay to catch the initial logs
    setTimeout(() => {
      loadLogs()
    }, 100)
  }, [loadLogs, loggerContext])

  // Export logs as JSON
  const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    const exportFileDefaultName = `logs_${new Date().toISOString()}.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  // Clear logs (just clears view, not actual buffer)
  const clearLogs = () => {
    setLogs([])
    setFilteredLogs([])
  }

  // Toggle hiding a specific pattern
  const toggleHidePattern = (log: LogEntry) => {
    const pattern = getPatternKey(log)
    setHiddenPatterns(prev => {
      const next = new Set(prev)
      if (next.has(pattern)) {
        next.delete(pattern)
      } else {
        next.add(pattern)
      }
      return next
    })
  }

  // Clear all hidden patterns
  const clearHiddenPatterns = () => {
    setHiddenPatterns(new Set())
  }

  // Table columns
  const columns = [
    {
      title: 'Time',
      dataIndex: 'context',
      width: 100,
      render: (context: LogEntry['context']) => (
        <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {formatTime(context.timestamp)}
        </Text>
      ),
    },
    {
      title: 'Level',
      dataIndex: 'level',
      width: 100,
      render: (level: LogLevel, record: LogEntry) => {
        // No need to check if hidden since filtered logs won't include hidden patterns
        return (
          <Space>
            <Tag color={levelColors[level]}>
              {LogLevel[level]}
            </Tag>
            <Button
              size="mini"
              type="text"
              onClick={() => toggleHidePattern(record)}
              title="Hide this pattern"
            >
              🚫
            </Button>
          </Space>
        )
      },
    },
    {
      title: 'Message',
      dataIndex: 'message',
      render: (message: string, record: LogEntry) => {
        // No strikethrough needed since hidden logs are filtered out
        return (
          <Space direction="vertical" style={{ width: '100%' }} size="mini">
            <Text>
              {message}
            </Text>
            {record.context?.source && showDetails && (
            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
              {record.context.source.file}:{record.context.source.line}
              {record.context.source.function && ` (${record.context.source.function})`}
            </Text>
          )}
          {record.error && showDetails && (
            <Card
              style={{
                backgroundColor: 'var(--color-fill-2)',
                border: '1px solid var(--color-border-2)',
                marginTop: 4,
              }}
              bodyStyle={{ padding: '8px 12px' }}
            >
              <Text type="error" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {record.error.message}
              </Text>
              {record.error.stack && (
                <pre style={{
                  fontSize: 11,
                  marginTop: 4,
                  maxHeight: 100,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                }}>
                  {record.error.stack}
                </pre>
              )}
            </Card>
          )}
          {record.data && Object.keys(record.data).length > 0 && showDetails && (
            <Card
              style={{
                backgroundColor: 'var(--color-fill-1)',
                border: '1px solid var(--color-border-1)',
                marginTop: 4,
              }}
              bodyStyle={{ padding: '8px 12px' }}
            >
              <pre style={{
                fontSize: 11,
                margin: 0,
                fontFamily: 'monospace',
                maxHeight: 150,
                overflow: 'auto',
              }}>
                {JSON.stringify(record.data, null, 2)}
              </pre>
            </Card>
          )}
          </Space>
        )
      },
    },
  ]

  // Level statistics
  const levelCounts = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1
    return acc
  }, {} as Record<LogLevel, number>)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Controls */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Select
            style={{ width: 120 }}
            value={selectedLevel}
            onChange={setSelectedLevel}
          >
            <Select.Option value="all">All Levels</Select.Option>
            <Select.Option value={LogLevel.ERROR}>
              <Badge count={levelCounts[LogLevel.ERROR] || 0} dot>
                <span>Error</span>
              </Badge>
            </Select.Option>
            <Select.Option value={LogLevel.WARN}>
              <Badge count={levelCounts[LogLevel.WARN] || 0} dot>
                <span>Warn</span>
              </Badge>
            </Select.Option>
            <Select.Option value={LogLevel.INFO}>
              <Badge count={levelCounts[LogLevel.INFO] || 0} dot>
                <span>Info</span>
              </Badge>
            </Select.Option>
            <Select.Option value={LogLevel.DEBUG}>
              <Badge count={levelCounts[LogLevel.DEBUG] || 0} dot>
                <span>Debug</span>
              </Badge>
            </Select.Option>
            <Select.Option value={LogLevel.TRACE}>
              <Badge count={levelCounts[LogLevel.TRACE] || 0} dot>
                <span>Trace</span>
              </Badge>
            </Select.Option>
          </Select>

          <Search
            style={{ width: 200 }}
            placeholder="Search logs..."
            value={searchText}
            onChange={setSearchText}
            prefix={<IconSearch />}
          />

          <Switch
            checked={showDetails}
            onChange={setShowDetails}
            checkedText="Details"
            uncheckedText="Compact"
          />
        </Space>

        <Space>
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedText="Auto"
            uncheckedText="Manual"
          />

          <Button
            icon={<IconRefresh />}
            onClick={loadLogs}
            disabled={autoRefresh}
          >
            Refresh
          </Button>

          <Button
            icon={<IconDownload />}
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
          >
            Export
          </Button>

          <Button
            icon={<IconDelete />}
            onClick={clearLogs}
            status="warning"
          >
            Clear View
          </Button>
        </Space>
      </Space>

      {/* Statistics */}
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Space>
          <Text type="secondary">
            Showing {filteredLogs.length} of {logs.length} logs
            {hiddenPatterns.size > 0 && ` (${Object.values(hiddenCounts).reduce((a, b) => a + b, 0)} hidden)`}
          </Text>
          {Object.entries(levelCounts).map(([level, count]) => (
            <Tag key={level} color={levelColors[Number(level) as LogLevel]}>
              {LogLevel[Number(level) as LogLevel]}: {count}
            </Tag>
          ))}
        </Space>

        {/* Hidden patterns info */}
        {hiddenPatterns.size > 0 && showHiddenCount && (
          <Space style={{ width: '100%', padding: '8px', background: 'var(--color-fill-2)', borderRadius: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hiding {hiddenPatterns.size} pattern{hiddenPatterns.size > 1 ? 's' : ''}:
            </Text>
            {Array.from(hiddenPatterns).map(pattern => {
              const count = hiddenCounts[pattern] || 0
              return (
                <Tag
                  key={pattern}
                  closable
                  onClose={() => {
                    setHiddenPatterns(prev => {
                      const next = new Set(prev)
                      next.delete(pattern)
                      return next
                    })
                  }}
                  style={{ fontSize: 11, maxWidth: 200 }}
                >
                  {pattern.substring(0, 30)}... ({count})
                </Tag>
              )
            })}
            <Button
              size="mini"
              onClick={clearHiddenPatterns}
            >
              Clear All
            </Button>
          </Space>
        )}
      </Space>

      {/* Log Table */}
      <Table
        columns={columns}
        data={filteredLogs}
        pagination={{
          pageSize: 50,
          showTotal: true,
          showJumper: true,
          sizeOptions: [10, 20, 50, 100],
        }}
        scroll={{ y: 400 }}
        size="small"
        rowKey={(record) => `${record.context.timestamp}-${record.message}`}
        style={{ minHeight: 400 }}
      />
    </Space>
  )
}
