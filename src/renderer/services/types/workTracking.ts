/**
 * Types for work tracking service - stubbed for testing
 * These interfaces define the shape of the WorkTrackingService API
 */

// Types removed - using UnifiedWorkSession from unified-work-session-types instead

// WorkSession type removed - using LocalWorkSession from store instead to avoid duplication

export interface WorkSessionPersistenceOptions {
  clearStaleSessionsOnStartup?: boolean
  maxSessionAgeHours?: number
}

// WorkTrackingServiceInterface removed - using concrete implementation instead to avoid type duplication
// The actual implementation uses LocalWorkSession from the store
