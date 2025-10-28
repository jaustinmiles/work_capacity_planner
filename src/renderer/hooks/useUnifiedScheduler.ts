import { useMemo } from 'react'
import { UnifiedScheduler } from '@shared/unified-scheduler'
import { logger } from '@/logger'

/**
 * React hook for using UnifiedScheduler in UI components
 * Returns the scheduler instance directly for components to use
 */
export function useUnifiedScheduler(): UnifiedScheduler {
  const scheduler = useMemo(() => {
    logger.ui.debug('Creating UnifiedScheduler instance')
    return new UnifiedScheduler()
  }, [])

  return scheduler
}

// Export types for convenience
export type { ScheduleResult, ScheduleConfig, ScheduleContext, UnifiedScheduleItem, SchedulingMetrics, SchedulingDebugInfo } from '@shared/unified-scheduler'
