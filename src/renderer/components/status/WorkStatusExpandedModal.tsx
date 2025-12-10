/**
 * WorkStatusExpandedModal Component
 *
 * Full-screen expanded view of work status with radar chart visualization
 * and detailed statistics by task type. Supports toggling time sinks on/off
 * in the radar chart visualization.
 */

import React, { useMemo, useState } from 'react'
import { Modal, Space, Typography, Progress, Statistic, Divider, Grid, Checkbox } from '@arco-design/web-react'
import { IconClose } from '@arco-design/web-react/icon'
import { RadarChart, prepareRadarChartData, RadarChartDataPoint, createRadarDataPointFromSink } from './RadarChart'
import { UserTaskType } from '@shared/user-task-types'
import { TimeSink } from '@shared/time-sink-types'
import { WorkBlock } from '@shared/work-blocks-types'
import { formatMinutes } from '@shared/time-utils'
import { BlockConfigKind, WorkBlockType } from '@shared/enums'

const { Title, Text } = Typography
const { Row, Col } = Grid

// ============================================================================
// Types
// ============================================================================

export interface WorkStatusExpandedModalProps {
  visible: boolean
  onClose: () => void
  accumulatedByType: Record<string, number>
  accumulatedBySink: Record<string, number>
  capacityByType: Record<string, number>
  userTaskTypes: UserTaskType[]
  timeSinks: TimeSink[]
  meetingMinutes: number
  totalPlannedMinutes: number
  accumulatedTotal: number
  currentBlock: WorkBlock | null
  nextBlock: WorkBlock | null
}

// ============================================================================
// Helper Functions
// ============================================================================

function getBlockTypeName(block: WorkBlock | null, userTypes: UserTaskType[]): string {
  if (!block) return 'None'

  const { typeConfig } = block
  if (typeConfig.kind === BlockConfigKind.System) {
    return typeConfig.systemType === WorkBlockType.Sleep ? 'Sleep' : 'Blocked'
  }
  if (typeConfig.kind === BlockConfigKind.Single) {
    const userType = userTypes.find(t => t.id === typeConfig.typeId)
    return userType?.name || 'Unknown'
  }
  if (typeConfig.kind === BlockConfigKind.Combo) {
    return typeConfig.allocations
      .map(a => {
        const userType = userTypes.find(t => t.id === a.typeId)
        return userType?.name || 'Unknown'
      })
      .join(' / ')
  }
  return 'Unknown'
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TypeBreakdownRowProps {
  type: UserTaskType
  logged: number
  planned: number
}

function TypeBreakdownRow({ type, logged, planned }: TypeBreakdownRowProps): React.ReactElement {
  const progress = planned > 0 ? Math.round((logged / planned) * 100) : 0
  const hasUnplannedWork = planned === 0 && logged > 0

  return (
    <div style={{ marginBottom: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text>
          {type.emoji} {type.name}
        </Text>
        <Text>
          {formatMinutes(logged)} / {formatMinutes(planned)}
          {planned > 0 && <Text style={{ marginLeft: 8, fontWeight: 600 }}>{progress}%</Text>}
        </Text>
      </Space>
      <Progress
        percent={hasUnplannedWork ? 100 : Math.min(progress, 100)}
        color={
          hasUnplannedWork
            ? '#ff7d00' // Orange for unplanned
            : progress >= 100
              ? '#00b42a' // Green for complete
              : type.color
        }
        showText={false}
      />
      {hasUnplannedWork && (
        <Text type="warning" style={{ fontSize: '12px' }}>
          ⚠️ Unplanned work logged
        </Text>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkStatusExpandedModal({
  visible,
  onClose,
  accumulatedByType,
  accumulatedBySink,
  capacityByType,
  userTaskTypes,
  timeSinks,
  meetingMinutes,
  totalPlannedMinutes,
  accumulatedTotal,
  currentBlock,
  nextBlock,
}: WorkStatusExpandedModalProps): React.ReactElement {
  // State for which time sinks are shown in the radar chart
  const [enabledSinkIds, setEnabledSinkIds] = useState<Set<string>>(new Set())

  // Toggle a time sink in the radar chart
  const handleToggleSink = (sinkId: string): void => {
    setEnabledSinkIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sinkId)) {
        newSet.delete(sinkId)
      } else {
        newSet.add(sinkId)
      }
      return newSet
    })
  }

  // Toggle all time sinks on/off
  const handleToggleAllSinks = (checked: boolean): void => {
    if (checked) {
      setEnabledSinkIds(new Set(timeSinks.map(s => s.id)))
    } else {
      setEnabledSinkIds(new Set())
    }
  }

  // Prepare radar chart data (task types + enabled time sinks)
  const radarData: RadarChartDataPoint[] = useMemo(() => {
    // Start with task type data
    const taskTypeData = prepareRadarChartData({
      accumulatedByType,
      userTaskTypes,
    })

    // Add enabled time sink data using factory function
    const sinkData: RadarChartDataPoint[] = timeSinks
      .filter(sink => enabledSinkIds.has(sink.id))
      .map(sink => createRadarDataPointFromSink(sink, accumulatedBySink[sink.id] ?? 0))

    // Combine and normalize
    const allData = [...taskTypeData, ...sinkData]

    // Re-normalize values based on combined max
    const maxValue = Math.max(...allData.map(d => d.rawValue), 1)
    return allData.map(d => ({
      ...d,
      value: d.rawValue / maxValue,
    }))
  }, [accumulatedByType, userTaskTypes, accumulatedBySink, timeSinks, enabledSinkIds])

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (totalPlannedMinutes === 0) return 0
    return Math.round((accumulatedTotal / totalPlannedMinutes) * 100)
  }, [accumulatedTotal, totalPlannedMinutes])

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={
        <Space>
          <span>📊</span>
          <span>Today&apos;s Work Distribution</span>
        </Space>
      }
      footer={null}
      style={{ width: '90vw', maxWidth: 900 }}
      closeIcon={<IconClose />}
    >
      <Row gutter={24}>
        {/* Left Column - Radar Chart */}
        <Col span={12}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Title heading={6} style={{ marginBottom: 16 }}>
              Time Distribution by Type
            </Title>
            <RadarChart
              data={radarData}
              size={350}
              showLabels={true}
              showGrid={true}
              fillOpacity={0.4}
            />
            {userTaskTypes.length < 3 && (
              <Text type="secondary" style={{ marginTop: 8, fontSize: '12px' }}>
                Add more task types for a full radar visualization
              </Text>
            )}

            {/* Time Sink Toggles */}
            {timeSinks.length > 0 && (
              <div style={{ marginTop: 16, width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Include Time Sinks:
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {/* Select All checkbox */}
                  <Checkbox
                    checked={enabledSinkIds.size === timeSinks.length && timeSinks.length > 0}
                    indeterminate={enabledSinkIds.size > 0 && enabledSinkIds.size < timeSinks.length}
                    onChange={handleToggleAllSinks}
                    style={{ marginRight: 8 }}
                  >
                    <Text type="secondary">All</Text>
                  </Checkbox>
                  {timeSinks.map(sink => (
                    <Checkbox
                      key={sink.id}
                      checked={enabledSinkIds.has(sink.id)}
                      onChange={() => handleToggleSink(sink.id)}
                      style={{ marginRight: 0 }}
                    >
                      <span style={{ color: sink.color }}>
                        {sink.emoji} {sink.name}
                      </span>
                      {(accumulatedBySink[sink.id] ?? 0) > 0 && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                          ({formatMinutes(accumulatedBySink[sink.id] ?? 0)})
                        </Text>
                      )}
                    </Checkbox>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Col>

        {/* Right Column - Type Breakdown */}
        <Col span={12}>
          <Title heading={6} style={{ marginBottom: 16 }}>
            Progress by Type
          </Title>
          {userTaskTypes.length === 0 ? (
            <Text type="secondary">No task types defined. Go to Settings to create types.</Text>
          ) : (
            userTaskTypes.map(type => (
              <TypeBreakdownRow
                key={type.id}
                type={type}
                logged={accumulatedByType[type.id] || 0}
                planned={capacityByType[type.id] || 0}
              />
            ))
          )}

          {/* Meeting time */}
          {meetingMinutes > 0 && (
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>🤝 Meetings</Text>
                <Text>{formatMinutes(meetingMinutes)}</Text>
              </Space>
            </div>
          )}
        </Col>
      </Row>

      <Divider />

      {/* Day Statistics */}
      <Title heading={6} style={{ marginBottom: 16 }}>
        Day Statistics
      </Title>
      <Row gutter={24}>
        <Col span={6}>
          <Statistic
            title="Total Logged"
            value={accumulatedTotal}
            suffix="min"
            styleValue={{ color: '#165DFF' }}
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(accumulatedTotal)}
          </Text>
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Planned"
            value={totalPlannedMinutes + meetingMinutes}
            suffix="min"
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(totalPlannedMinutes + meetingMinutes)}
          </Text>
        </Col>
        <Col span={6}>
          <Statistic
            title="Progress"
            value={overallProgress}
            suffix="%"
            styleValue={{ color: overallProgress >= 100 ? '#00b42a' : '#165DFF' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Remaining"
            value={Math.max(0, totalPlannedMinutes - accumulatedTotal)}
            suffix="min"
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(Math.max(0, totalPlannedMinutes - accumulatedTotal))}
          </Text>
        </Col>
      </Row>

      <Divider />

      {/* Current Block Info */}
      <Row gutter={24}>
        <Col span={12}>
          <Title heading={6} style={{ marginBottom: 8 }}>
            Current Block
          </Title>
          {currentBlock ? (
            <Space direction="vertical">
              <Text>
                <strong>{currentBlock.startTime} - {currentBlock.endTime}</strong>
              </Text>
              <Text>{getBlockTypeName(currentBlock, userTaskTypes)}</Text>
              {currentBlock.capacity && (
                <Text type="secondary">
                  Capacity: {formatMinutes(currentBlock.capacity.totalMinutes)}
                </Text>
              )}
            </Space>
          ) : (
            <Text type="secondary">No active work block</Text>
          )}
        </Col>
        <Col span={12}>
          <Title heading={6} style={{ marginBottom: 8 }}>
            Next Block
          </Title>
          {nextBlock ? (
            <Space direction="vertical">
              <Text>
                <strong>{nextBlock.startTime} - {nextBlock.endTime}</strong>
              </Text>
              <Text>{getBlockTypeName(nextBlock, userTaskTypes)}</Text>
              {nextBlock.capacity && (
                <Text type="secondary">
                  Capacity: {formatMinutes(nextBlock.capacity.totalMinutes)}
                </Text>
              )}
            </Space>
          ) : (
            <Text type="secondary">No more blocks today</Text>
          )}
        </Col>
      </Row>
    </Modal>
  )
}
