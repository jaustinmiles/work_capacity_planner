import { ReactElement } from 'react'
import { Space, Typography, Tag, Progress } from '@arco-design/web-react'
import { formatMinutes } from '@shared/time-utils'
import { UserTaskType } from '@shared/user-task-types'

const { Text } = Typography

export interface PlannedVsLoggedWidgetProps {
  /** Accumulated minutes by task type ID */
  accumulatedByType: Record<string, number>
  /** Planned capacity minutes by task type ID */
  capacityByType: Record<string, number>
  /** User-defined task types */
  userTaskTypes: UserTaskType[]
  /** Total meeting minutes for the day */
  meetingMinutes: number
  /** Total planned minutes (sum of all capacities) */
  totalPlannedMinutes: number
  /** Total accumulated minutes across all types */
  accumulatedTotal: number
  /** Compact display mode */
  isCompact?: boolean
}

/**
 * PlannedVsLoggedWidget - Shows planned capacity vs logged time by type
 *
 * Combines:
 * - Planned capacity per type (from work blocks)
 * - Progress bars showing logged vs planned
 * - Totals and meeting time
 */
export function PlannedVsLoggedWidget({
  accumulatedByType,
  capacityByType,
  userTaskTypes,
  meetingMinutes,
  totalPlannedMinutes,
  accumulatedTotal,
  isCompact = false,
}: PlannedVsLoggedWidgetProps): ReactElement {
  return (
    <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Text style={{ fontWeight: 600 }}>
          {isCompact ? 'Capacity vs Logged' : 'Planned vs Logged Today'}
        </Text>

        {userTaskTypes.length === 0 ? (
          <Text type="secondary">No task types defined. Go to Settings to create types.</Text>
        ) : (
          userTaskTypes.map(taskType => {
            const logged = accumulatedByType[taskType.id] || 0
            const planned = capacityByType[taskType.id] || 0
            // Don't show misleading 100% for unplanned work - show 0% instead
            const progress = planned > 0 ? Math.round((logged / planned) * 100) : 0
            const hasUnplannedWork = planned === 0 && logged > 0

            return (
              <div key={taskType.id} style={{ marginBottom: 4 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  <Text style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {taskType.emoji} {isCompact ? '' : taskType.name}
                  </Text>
                  <Space size="small">
                    <Tag
                      style={{
                        backgroundColor: taskType.color,
                        color: '#fff',
                        border: 'none',
                        fontSize: '11px',
                      }}
                    >
                      {formatMinutes(logged)}
                      {!isCompact && planned > 0 && ` / ${formatMinutes(planned)}`}
                    </Tag>
                    {!isCompact && planned > 0 && (
                      <Text style={{ fontWeight: 500, fontSize: '12px', minWidth: 36, textAlign: 'right' }}>
                        {progress}%
                      </Text>
                    )}
                  </Space>
                </Space>
                <Progress
                  percent={hasUnplannedWork ? 100 : Math.min(progress, 100)}
                  showText={false}
                  size="small"
                  color={
                    hasUnplannedWork
                      ? '#ff7d00' // Orange warning for unplanned work
                      : progress >= 100
                        ? '#00b42a' // Green for complete
                        : taskType.color
                  }
                  style={{ marginTop: 2 }}
                />
                {hasUnplannedWork && (
                  <Text type="warning" style={{ fontSize: '10px' }}>
                    {isCompact ? '⚠️' : '⚠️ Unplanned work logged'}
                  </Text>
                )}
              </div>
            )
          })
        )}

        {/* Meeting time row */}
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
          <Text>🤝 {isCompact ? '' : 'Meetings'}</Text>
          <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
        </Space>

        {/* Totals row */}
        <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
            <Text style={{ fontWeight: 600, color: '#1D2129' }}>
              {isCompact ? 'Total' : 'Logged / Planned'}
            </Text>
            <Text style={{ fontWeight: 600, color: '#1D2129' }}>
              {formatMinutes(accumulatedTotal)}
              {!isCompact && ` / ${formatMinutes(totalPlannedMinutes + meetingMinutes)}`}
            </Text>
          </Space>
        </div>
      </Space>
    </div>
  )
}
