import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Button } from '@arco-design/web-react'
import { IconFullscreen } from '@arco-design/web-react/icon'
import { WorkStatusExpandedModal } from './WorkStatusExpandedModal'
import { StartNextTaskWidget } from './StartNextTaskWidget'
import { PlannedVsLoggedWidget } from './PlannedVsLoggedWidget'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { calculateDuration, formatTimeHHMM, dateToYYYYMMDD } from '@shared/time-utils'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { getDatabase } from '../../services/database'
import { WorkBlock, getTotalCapacityByType } from '@shared/work-blocks-types'

interface DailyPattern {
  blocks: WorkBlock[]
  meetings?: Array<{ startTime: string; endTime: string }>
}

/**
 * WorkStatusWidget - Orchestrator for work status display
 *
 * This component:
 * - Loads work pattern and accumulated time data
 * - Computes capacity by type
 * - Renders StartNextTaskWidget and PlannedVsLoggedWidget
 * - Handles the expanded modal for detailed view
 */
export function WorkStatusWidget(): React.ReactElement {
  const { isCompact } = useResponsive()

  // Store subscriptions for data that child widgets don't need
  const activeWorkSessions = useTaskStore(state => state.activeWorkSessions)
  const workPatterns = useWorkPatternStore(state => state.workPatterns)

  // User-defined task types
  const userTaskTypes = useSortedUserTaskTypes()

  // UI state
  const [isExpanded, setIsExpanded] = useState(false)

  // Data state
  const [pattern, setPattern] = useState<DailyPattern | null>(null)
  const [accumulatedByType, setAccumulatedByType] = useState<Record<string, number>>({})
  const [accumulatedTotal, setAccumulatedTotal] = useState(0)
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [meetingMinutes, setMeetingMinutes] = useState(0)

  // Get current date
  const currentDate = useMemo(() => {
    const now = getCurrentTime()
    return dateToYYYYMMDD(now)
  }, [])

  // Load work data when patterns change
  useEffect(() => {
    if (!workPatterns || workPatterns.length === 0) {
      return
    }

    const loadWorkData = async (): Promise<void> => {
      try {
        const todayPattern = workPatterns.find(p => p.date === currentDate)

        if (todayPattern) {
          setPattern(todayPattern)

          // Get current and next blocks
          const now = getCurrentTime()
          const currentTimeStr = formatTimeHHMM(now)

          const current = todayPattern.blocks.find(block =>
            block.startTime <= currentTimeStr && block.endTime > currentTimeStr,
          )
          setCurrentBlock(current || null)

          const next = todayPattern.blocks.find(block =>
            block.startTime > currentTimeStr,
          )
          setNextBlock(next || null)

          // Calculate meeting minutes
          interface MeetingWithTime {
            startTime: string
            endTime: string
          }
          const totalMeetingMinutes = todayPattern.meetings?.reduce((total: number, meeting: MeetingWithTime) => {
            return total + calculateDuration(meeting.startTime, meeting.endTime)
          }, 0) || 0
          setMeetingMinutes(totalMeetingMinutes)

          // Load accumulated time (dynamic by type)
          const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
          setAccumulatedByType(accumulatedData.byType || {})
          setAccumulatedTotal(accumulatedData.total || 0)
        } else {
          // No pattern for today
          setPattern(null)
          setCurrentBlock(null)
          setNextBlock(null)
          setMeetingMinutes(0)
          setAccumulatedByType({})
          setAccumulatedTotal(0)
        }
      } catch (error) {
        logger.ui.error('Failed to load work data', { error })
      }
    }

    loadWorkData()
  }, [currentDate, workPatterns])

  // Refresh accumulated times when sessions change
  useEffect(() => {
    const handleDataChange = async (): Promise<void> => {
      if (pattern) {
        try {
          const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
          setAccumulatedByType(accumulatedData.byType || {})
          setAccumulatedTotal(accumulatedData.total || 0)
        } catch (error) {
          logger.ui.error('Failed to refresh accumulated times', { error })
        }
      }
    }

    handleDataChange()
  }, [pattern, currentDate, activeWorkSessions])

  // Calculate total capacity for the day using dynamic type system
  const capacityByType = useMemo(() => {
    if (!pattern || !pattern.blocks) {
      return {} as Record<string, number>
    }
    return getTotalCapacityByType(pattern.blocks, [])
  }, [pattern])

  // Calculate total planned minutes (sum of all type capacities)
  const totalPlannedMinutes = useMemo(() => {
    return Object.values(capacityByType).reduce((sum, mins) => sum + mins, 0)
  }, [capacityByType])

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        {/* Start Next Task Widget */}
        <StartNextTaskWidget />

        {/* Planned vs Logged Widget */}
        <PlannedVsLoggedWidget
          accumulatedByType={accumulatedByType}
          capacityByType={capacityByType}
          userTaskTypes={userTaskTypes}
          meetingMinutes={meetingMinutes}
          totalPlannedMinutes={totalPlannedMinutes}
          accumulatedTotal={accumulatedTotal}
          isCompact={isCompact}
        />

        {/* Expand Button */}
        <Button
          type="text"
          icon={<IconFullscreen />}
          onClick={() => setIsExpanded(true)}
          style={{ width: '100%' }}
        >
          {isCompact ? 'Details' : 'View Full Details'}
        </Button>

        {/* Expanded Modal - includes Current/Next Block and Quick Stats */}
        <WorkStatusExpandedModal
          visible={isExpanded}
          onClose={() => setIsExpanded(false)}
          accumulatedByType={accumulatedByType}
          capacityByType={capacityByType}
          userTaskTypes={userTaskTypes}
          meetingMinutes={meetingMinutes}
          totalPlannedMinutes={totalPlannedMinutes}
          accumulatedTotal={accumulatedTotal}
          currentBlock={currentBlock}
          nextBlock={nextBlock}
        />
      </Space>
    </Card>
  )
}
