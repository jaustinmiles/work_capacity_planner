/**
 * TimeTypeBreakdown - Floating panel showing remaining time per task type
 *
 * Displays a collapsible panel at the bottom-right of the graph canvas
 * with stacked bars showing time remaining grouped by task type.
 */

import { useState, useMemo } from 'react'
import { Card, Typography, Space, Progress } from '@arco-design/web-react'
import { IconDown, IconUp } from '@arco-design/web-react/icon'
import type { EndeavorWithTasks } from '@shared/types'
import type { UserTaskType } from '@shared/user-task-types'
import { aggregateTimeByType } from '@shared/endeavor-graph-utils'
import { formatMinutes } from '@shared/time-utils'

const { Text } = Typography

interface TimeTypeBreakdownProps {
  endeavors: EndeavorWithTasks[]
  userTypes: UserTaskType[]
}

export function TimeTypeBreakdown({ endeavors, userTypes }: TimeTypeBreakdownProps) {
  const [collapsed, setCollapsed] = useState(false)

  const aggregated = useMemo(
    () => aggregateTimeByType(endeavors, userTypes),
    [endeavors, userTypes],
  )

  const totalRemaining = aggregated.reduce((sum, e) => sum + e.remaining, 0)

  if (aggregated.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 10,
        width: 240,
      }}
    >
      <Card
        size="small"
        style={{
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
        }}
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Text style={{ fontSize: 12, fontWeight: 600 }}>
              Time Remaining
            </Text>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {formatMinutes(totalRemaining)}
              </Text>
              {collapsed ? <IconDown style={{ fontSize: 12 }} /> : <IconUp style={{ fontSize: 12 }} />}
            </Space>
          </div>
        }
      >
        {!collapsed && (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {aggregated.map((entry) => {
              const percent = entry.total > 0
                ? Math.round(((entry.total - entry.remaining) / entry.total) * 100)
                : 0

              return (
                <div key={entry.typeName}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 11 }}>
                      {entry.typeEmoji && `${entry.typeEmoji} `}{entry.typeName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatMinutes(entry.remaining)}
                    </Text>
                  </div>
                  <Progress
                    percent={percent}
                    size="mini"
                    color={entry.typeColor}
                    showText={false}
                  />
                </div>
              )
            })}
          </Space>
        )}
      </Card>
    </div>
  )
}
