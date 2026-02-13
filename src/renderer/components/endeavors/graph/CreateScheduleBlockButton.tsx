/**
 * CreateScheduleBlockButton - Floating action button to start work on next step
 *
 * Finds the next unblocked step across all endeavors, then starts a work session.
 * Shows a pulse animation on the active node.
 */

import { useState, useMemo, useCallback } from 'react'
import { Button, Typography, Space } from '@arco-design/web-react'
import { IconPlayArrow } from '@arco-design/web-react/icon'
import { Message } from '../../common/Message'
import type { EndeavorWithTasks, EndeavorDependencyWithNames } from '@shared/types'
import { findNextUnblockedStep } from '@shared/next-unblocked-step'
import { useTaskStore } from '../../../store/useTaskStore'

const { Text } = Typography

const MAX_BLOCK_DURATION = 30
const DEFAULT_BLOCK_DURATION = 25

interface CreateScheduleBlockButtonProps {
  endeavors: EndeavorWithTasks[]
  dependencies: Map<string, EndeavorDependencyWithNames[]>
  activeStepNodeId: string | null
  onStepStarted: (nodeId: string) => void
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h${m > 0 ? ` ${m}m` : ''}`
  }
  return `${minutes}m`
}

export function CreateScheduleBlockButton({
  endeavors,
  dependencies,
  activeStepNodeId,
  onStepStarted,
}: CreateScheduleBlockButtonProps) {
  const [loading, setLoading] = useState(false)
  const { startWorkOnStep, startWorkOnTask } = useTaskStore()

  const nextStep = useMemo(
    () => findNextUnblockedStep(endeavors, dependencies),
    [endeavors, dependencies],
  )

  const blockDuration = useMemo(() => {
    if (!nextStep) return DEFAULT_BLOCK_DURATION
    return nextStep.duration <= MAX_BLOCK_DURATION ? nextStep.duration : DEFAULT_BLOCK_DURATION
  }, [nextStep])

  const handleStart = useCallback(async () => {
    if (!nextStep) return

    setLoading(true)
    try {
      if (nextStep.isSimpleTask) {
        await startWorkOnTask(nextStep.taskId)
      } else {
        await startWorkOnStep(nextStep.stepId, nextStep.taskId)
      }

      const nodeId = nextStep.isSimpleTask
        ? `task-${nextStep.taskId}`
        : `step-${nextStep.stepId}`

      onStepStarted(nodeId)
      Message.success(`Started: ${nextStep.name} (${formatDuration(blockDuration)})`)
    } catch (err) {
      Message.error(`Failed to start work: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [nextStep, blockDuration, startWorkOnStep, startWorkOnTask, onStepStarted])

  const isActive = activeStepNodeId !== null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
      }}
    >
      <Button
        type="primary"
        size="large"
        icon={<IconPlayArrow />}
        loading={loading}
        disabled={!nextStep || isActive}
        onClick={handleStart}
        style={{
          borderRadius: 24,
          padding: '0 24px',
          height: 44,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <Space size={4}>
          {!nextStep ? (
            <Text style={{ color: 'inherit' }}>All Blocked</Text>
          ) : isActive ? (
            <Text style={{ color: 'inherit' }}>Working...</Text>
          ) : (
            <Text style={{ color: 'inherit' }}>
              Work on Next Step ({formatDuration(blockDuration)})
            </Text>
          )}
        </Space>
      </Button>
    </div>
  )
}
