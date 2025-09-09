/**
 * Types for work tracking service - stubbed for testing
 * These interfaces define the shape of the WorkTrackingService API
 */

import type { WorkSession as BaseWorkSession } from '../../../shared/work-blocks-types'
import type { Task, TaskStep } from '../../../shared/types'

// WorkSession type removed - using LocalWorkSession from store instead to avoid duplication

export interface WorkSessionPersistenceOptions {
  clearStaleSessionsOnStartup?: boolean
  maxSessionAgeHours?: number
}

// WorkTrackingServiceInterface removed - using concrete implementation instead to avoid type duplication
// The actual implementation uses LocalWorkSession from the store
