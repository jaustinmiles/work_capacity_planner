/**
 * REACTIVE WORK PATTERN STORE
 *
 * Manages work patterns, current blocks, and accumulated time.
 * Automatically loads from database and subscribes to changes.
 * No events, no manual refreshes, pure reactivity.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { DailyWorkPattern, WorkBlock } from '@/shared/work-blocks-types'
import { WorkBlockType } from '@/shared/enums'
import { getCurrentTime } from '@/shared/time-provider'
import { calculateDuration, timeStringToMinutes, formatTimeHHMM, dateToYYYYMMDD } from '@/shared/time-utils'
import { logger } from '@/logger'

interface AccumulatedTime {
  focused: number
  admin: number
  personal: number
}

interface WorkPatternStoreState {
  // Core state
  workPatterns: DailyWorkPattern[]
  isLoading: boolean
  error: string | null

  // Derived state
  currentPattern: DailyWorkPattern | null
  currentBlock: WorkBlock | null
  nextBlock: WorkBlock | null
  accumulated: AccumulatedTime
  meetingMinutes: number

  // Actions
  loadWorkPatterns: () => Promise<void>
  setWorkPatterns: (patterns: DailyWorkPattern[]) => void
  refreshDerivedState: () => void
  clearWorkPatterns: () => void
}

const findCurrentAndNextBlock = (
  pattern: DailyWorkPattern | null,
  currentTime: Date,
): { current: WorkBlock | null; next: WorkBlock | null } => {
  if (!pattern) return { current: null, next: null }

  const currentTimeStr = formatTimeHHMM(currentTime) // "HH:MM"

  // Find current block
  const current = pattern.blocks.find(block => {
    // Handle blocks that cross midnight
    if (block.endTime < block.startTime) {
      return currentTimeStr >= block.startTime || currentTimeStr < block.endTime
    } else {
      return currentTimeStr >= block.startTime && currentTimeStr < block.endTime
    }
  })

  // Find next block
  const futureBlocks = pattern.blocks.filter(block => {
    // For midnight-crossing blocks, be more careful
    if (block.endTime < block.startTime) {
      // If we're before the end time (early morning), this block is current, not next
      if (currentTimeStr < block.endTime) {
        return false
      }
    }
    return block.startTime > currentTimeStr
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))

  return {
    current: current || null,
    next: futureBlocks[0] || null,
  }
}

const calculateAccumulatedTime = (
  pattern: DailyWorkPattern | null,
  currentTime: Date,
): AccumulatedTime => {
  const accumulated = { focused: 0, admin: 0, personal: 0 }

  if (!pattern) return accumulated

  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

  pattern.blocks.forEach(block => {
    const blockStart = timeStringToMinutes(block.startTime)
    const blockDuration = calculateDuration(block.startTime, block.endTime)

    // Only count blocks that have already happened or are currently happening
    if (blockStart < currentMinutes) {
      // Calculate how much of this block has passed
      const effectiveDuration = Math.min(blockDuration, currentMinutes - blockStart)

      switch (block.type) {
        case WorkBlockType.Focused:
          accumulated.focused += effectiveDuration
          break
        case WorkBlockType.Admin:
          accumulated.admin += effectiveDuration
          break
        case WorkBlockType.Personal:
          accumulated.personal += effectiveDuration
          break
        case WorkBlockType.Mixed:
          // Mixed blocks REQUIRE explicit split ratio - no default
          if (block.capacity?.splitRatio) {
            accumulated.focused += Math.floor(effectiveDuration * block.capacity.splitRatio.focus)
            accumulated.admin += Math.floor(effectiveDuration * block.capacity.splitRatio.admin)
          } else {
            // This should never happen - Mixed blocks must define their split
            throw new Error(`Mixed block ${block.id} is missing required capacity.splitRatio`)
          }
          break
      }
    }
  })

  return accumulated
}

const calculateMeetingMinutes = (pattern: DailyWorkPattern | null): number => {
  if (!pattern) return 0
  return pattern.meetings.reduce((total, meeting) => {
    const duration = calculateDuration(meeting.startTime, meeting.endTime)
    return total + duration
  }, 0)
}

export const useWorkPatternStore = create<WorkPatternStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    workPatterns: [],
    isLoading: false,
    error: null,
    currentPattern: null,
    currentBlock: null,
    nextBlock: null,
    accumulated: { focused: 0, admin: 0, personal: 0 },
    meetingMinutes: 0,

    loadWorkPatterns: async () => {
      set({ isLoading: true, error: null })
      try {
        const patterns = await window.electronAPI.db.getWorkPatterns()

        // Find today's pattern
        const currentTime = getCurrentTime()
        const todayKey = currentTime.toISOString().split('T')[0]
        const currentPattern = patterns.find((p: DailyWorkPattern) => p.date === todayKey) || null

        // Calculate derived state
        const { current, next } = findCurrentAndNextBlock(currentPattern, currentTime)
        const accumulated = calculateAccumulatedTime(currentPattern, currentTime)
        const meetingMinutes = calculateMeetingMinutes(currentPattern)

        set({
          workPatterns: patterns,
          currentPattern,
          currentBlock: current,
          nextBlock: next,
          accumulated,
          meetingMinutes,
          isLoading: false,
        })

        logger.ui.info('Work patterns loaded', {
          count: patterns.length,
          hasToday: !!currentPattern,
        }, 'work-patterns-loaded')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        set({ error: errorMessage, isLoading: false })
        logger.ui.error('Failed to load work patterns', { error: errorMessage }, 'work-patterns-error')
      }
    },

    setWorkPatterns: (patterns) => {
      const currentTime = getCurrentTime()
      const todayKey = dateToYYYYMMDD(currentTime)
      const currentPattern = patterns.find(p => p.date === todayKey) || null

      const { current, next } = findCurrentAndNextBlock(currentPattern, currentTime)
      const accumulated = calculateAccumulatedTime(currentPattern, currentTime)
      const meetingMinutes = calculateMeetingMinutes(currentPattern)

      set({
        workPatterns: patterns,
        currentPattern,
        currentBlock: current,
        nextBlock: next,
        accumulated,
        meetingMinutes,
      })
    },

    refreshDerivedState: () => {
      const state = get()
      const currentTime = getCurrentTime()
      const todayKey = dateToYYYYMMDD(currentTime)
      const currentPattern = state.workPatterns.find(p => p.date === todayKey) || null

      const { current, next } = findCurrentAndNextBlock(currentPattern, currentTime)
      const accumulated = calculateAccumulatedTime(currentPattern, currentTime)
      const meetingMinutes = calculateMeetingMinutes(currentPattern)

      set({
        currentPattern,
        currentBlock: current,
        nextBlock: next,
        accumulated,
        meetingMinutes,
      })
    },

    clearWorkPatterns: () => {
      logger.ui.info('Clearing work patterns for session switch', {}, 'work-patterns-clear')
      set({
        workPatterns: [],
        isLoading: false,
        error: null,
        currentPattern: null,
        currentBlock: null,
        nextBlock: null,
        accumulated: { focused: 0, admin: 0, personal: 0 },
        meetingMinutes: 0,
      })
    },
  })),
)

// Auto-refresh derived state every minute to keep current block accurate
if (typeof window !== 'undefined') {
  setInterval(() => {
    useWorkPatternStore.getState().refreshDerivedState()
  }, 60000) // Every minute
}
