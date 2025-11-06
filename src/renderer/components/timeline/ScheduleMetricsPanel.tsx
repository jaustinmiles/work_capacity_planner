/**
 * Modern metrics display panel for schedule visualization
 * Provides an elegant, informative view of scheduling metrics
 */

import React from 'react'
import { Card, Row, Col, Progress, Tooltip, Tag, Space } from '@arco-design/web-react'
import {
  IconClockCircle,
  IconCalendar,
  IconThunderbolt,
  IconFire,
  IconCheckCircle,
  IconExclamationCircle,
  IconInfoCircle,
} from '@arco-design/web-react/icon'
import { SchedulingMetrics } from '../../../shared/unified-scheduler-types'
import {
  getUtilizationDescription,
  getDeadlineRiskDescription,
} from '../../../shared/scheduler-metrics'
import './ScheduleMetricsPanel.css'

interface ScheduleMetricsPanelProps {
  metrics: SchedulingMetrics | null
  scheduledCount: number
  unscheduledCount: number
  className?: string
}

export const ScheduleMetricsPanel: React.FC<ScheduleMetricsPanelProps> = ({
  metrics,
  scheduledCount,
  unscheduledCount,
  className,
}) => {
  if (!metrics) {
    return (
      <Card className={`schedule-metrics-panel ${className || ''}`}>
        <div className="metrics-loading">
          <IconInfoCircle style={{ fontSize: 48, color: '#8c8c8c' }} />
          <p>No metrics available</p>
        </div>
      </Card>
    )
  }

  const totalItems = scheduledCount + unscheduledCount
  const completionRate = totalItems > 0 ? (scheduledCount / totalItems) * 100 : 100
  const utilization = metrics.averageUtilization || 0
  const utilizationInfo = getUtilizationDescription(utilization)
  const riskInfo = getDeadlineRiskDescription(metrics.deadlineRiskScore || 0)

  // Format completion date
  const completionDate = metrics.projectedCompletionDate
    ? new Date(metrics.projectedCompletionDate)
    : null
  const daysUntilCompletion = completionDate
    ? Math.ceil((completionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <Card className={`schedule-metrics-panel ${className || ''}`}>
      {/* Header with completion stats */}
      <div className="metrics-header">
        <Row gutter={24} align="center">
          <Col span={12}>
            <div className="metric-stat">
              <div className="stat-value">
                <span className="value-number">{scheduledCount}</span>
                <span className="value-suffix">/{totalItems}</span>
              </div>
              <div className="stat-label">Tasks Scheduled</div>
              <Progress
                percent={completionRate}
                size="small"
                showText={false}
                color={completionRate === 100 ? '#52c41a' : '#1890ff'}
                style={{ marginTop: 8 }}
              />
            </div>
          </Col>
          <Col span={12}>
            <div className="metric-stat">
              <div className="stat-value">
                <IconCalendar style={{ marginRight: 8 }} />
                <span className="value-number">{daysUntilCompletion}</span>
                <span className="value-suffix">days</span>
              </div>
              <div className="stat-label">Until Completion</div>
              {completionDate && (
                <Tag color="arcoblue" style={{ marginTop: 8 }}>
                  {completionDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Tag>
              )}
            </div>
          </Col>
        </Row>
      </div>

      {/* Key Metrics Grid */}
      <div className="metrics-grid">
        <Row gutter={[16, 16]}>
          {/* Utilization Metric */}
          <Col xs={24} sm={12} lg={6}>
            <div className="metric-card">
              <div className="metric-icon" style={{ backgroundColor: `${utilizationInfo.color}15` }}>
                <IconThunderbolt style={{ color: utilizationInfo.color, fontSize: 24 }} />
              </div>
              <div className="metric-content">
                <div className="metric-title">Utilization</div>
                <div className="metric-value" style={{ color: utilizationInfo.color }}>
                  {Math.round(utilization * 100)}%
                </div>
                <div className="metric-label">{utilizationInfo.label}</div>
                <Tooltip content={utilizationInfo.description}>
                  <IconInfoCircle
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      color: '#8c8c8c',
                      cursor: 'pointer',
                    }}
                  />
                </Tooltip>
              </div>
              <Progress
                percent={utilization * 100}
                size="small"
                showText={false}
                color={utilizationInfo.color}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
              />
            </div>
          </Col>

          {/* Deadline Risk Metric */}
          <Col xs={24} sm={12} lg={6}>
            <div className="metric-card">
              <div className="metric-icon" style={{ backgroundColor: `${riskInfo.color}15` }}>
                {riskInfo.icon === '🚨' ? (
                  <IconExclamationCircle style={{ color: riskInfo.color, fontSize: 24 }} />
                ) : (
                  <IconCheckCircle style={{ color: riskInfo.color, fontSize: 24 }} />
                )}
              </div>
              <div className="metric-content">
                <div className="metric-title">Deadline Risk</div>
                <div className="metric-value" style={{ color: riskInfo.color }}>
                  {riskInfo.label}
                </div>
                {metrics.deadlinesMissed > 0 && (
                  <div className="metric-label">{metrics.deadlinesMissed} at risk</div>
                )}
                <Tooltip content={riskInfo.description}>
                  <IconInfoCircle
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      color: '#8c8c8c',
                      cursor: 'pointer',
                    }}
                  />
                </Tooltip>
              </div>
              <Progress
                percent={(metrics.deadlineRiskScore || 0) * 100}
                size="small"
                showText={false}
                color={riskInfo.color}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
              />
            </div>
          </Col>

          {/* Work Hours Metric */}
          <Col xs={24} sm={12} lg={6}>
            <div className="metric-card">
              <div className="metric-icon" style={{ backgroundColor: '#f0f5ff' }}>
                <IconClockCircle style={{ color: '#1890ff', fontSize: 24 }} />
              </div>
              <div className="metric-content">
                <div className="metric-title">Total Work</div>
                <div className="metric-value">
                  {Math.round(
                    (metrics.totalFocusedHours || 0) +
                    (metrics.totalAdminHours || 0) +
                    (metrics.totalPersonalHours || 0),
                  )}h
                </div>
                <div className="metric-breakdown">
                  <Space size={4}>
                    <Tag color="blue" size="small">
                      {Math.round(metrics.totalFocusedHours || 0)}h focus
                    </Tag>
                    <Tag color="green" size="small">
                      {Math.round(metrics.totalAdminHours || 0)}h admin
                    </Tag>
                  </Space>
                </div>
              </div>
            </div>
          </Col>

          {/* Priority Metric */}
          <Col xs={24} sm={12} lg={6}>
            <div className="metric-card">
              <div className="metric-icon" style={{ backgroundColor: '#fff7e6' }}>
                <IconFire style={{ color: '#fa8c16', fontSize: 24 }} />
              </div>
              <div className="metric-content">
                <div className="metric-title">Avg Priority</div>
                <div className="metric-value">
                  {Math.round(metrics.averagePriority || 0)}
                </div>
                <div className="metric-label">
                  {metrics.averagePriority >= 70
                    ? 'High Priority'
                    : metrics.averagePriority >= 40
                    ? 'Medium Priority'
                    : 'Low Priority'}
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </div>

      {/* Peak Utilization Warning */}
      {metrics.peakUtilization > 0.9 && (
        <div className="metrics-warning">
          <IconExclamationCircle style={{ marginRight: 8 }} />
          <span>
            Peak utilization reaches {Math.round(metrics.peakUtilization * 100)}% -
            consider redistributing tasks for better balance
          </span>
        </div>
      )}

      {/* Unscheduled Items Warning */}
      {unscheduledCount > 0 && (
        <div className="metrics-info">
          <IconInfoCircle style={{ marginRight: 8 }} />
          <span>
            {unscheduledCount} items couldn&apos;t be scheduled due to capacity or dependency constraints
          </span>
        </div>
      )}
    </Card>
  )
}

export default ScheduleMetricsPanel
