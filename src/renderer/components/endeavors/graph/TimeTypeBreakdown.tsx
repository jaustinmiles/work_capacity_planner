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
import { computeTimeByType } from '@shared/endeavor-graph-utils'

const { Text } = Typography

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
  }
  return `${mins}m`
}

interface TimeTypeBreakdownProps {
  endeavors: EndeavorWithTasks[]
  userTypes: UserTaskType[]
}

export function TimeTypeBreakdown({ endeavors, userTypes }: TimeTypeBreakdownProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Aggregate time across all endeavors
  const aggregated = useMemo(() => {
    const typeMap = new Map<string, {
      typeName: string
      typeColor: string
      typeEmoji: string
      remaining: number
      total: number
    }>()

    for (const endeavor of endeavors) {
      const entries = computeTimeByType(endeavor, userTypes)
      for (const entry of entries) {
        const existing = typeMap.get(entry.typeId)
        if (existing) {
          existing.remaining += entry.remainingMinutes
          existing.total += entry.totalMinutes
        } else {
          typeMap.set(entry.typeId, {
            typeName: entry.typeName,
            typeColor: entry.typeColor,
            typeEmoji: entry.typeEmoji,
            remaining: entry.remainingMinutes,
            total: entry.totalMinutes,
          })
        }
      }
    }

    return Array.from(typeMap.values())
      .filter(e => e.total > 0)
      .sort((a, b) => b.remaining - a.remaining)
  }, [endeavors, userTypes])

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
                {formatDuration(totalRemaining)}
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
                      {formatDuration(entry.remaining)}
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
