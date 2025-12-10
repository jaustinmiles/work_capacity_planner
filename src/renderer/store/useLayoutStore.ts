/**
 * LAYOUT STORE
 *
 * Manages user layout preferences for responsive ultra-wide screen support.
 * Preferences are persisted to localStorage for consistency across sessions.
 *
 * This store:
 * - Stores Work Logger layout mode preference
 * - Stores SwimLane day count preference
 * - Stores Gantt row label width preference
 * - Provides 'auto' option for intelligent breakpoint-based defaults
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { WorkLoggerLayoutMode } from '@shared/enums'

/**
 * SwimLane day count - either a specific number or 'auto' for breakpoint-based defaults
 */
type SwimLaneDayCountSetting = number | 'auto'

/**
 * Gantt row label width - either a specific number or 'auto' for breakpoint-based defaults
 */
type GanttRowLabelWidthSetting = number | 'auto'

interface LayoutState {
  // User preferences
  workLoggerLayout: WorkLoggerLayoutMode
  swimLaneDayCount: SwimLaneDayCountSetting
  ganttRowLabelWidth: GanttRowLabelWidthSetting

  // Actions
  setWorkLoggerLayout: (layout: WorkLoggerLayoutMode) => void
  setSwimLaneDayCount: (count: SwimLaneDayCountSetting) => void
  setGanttRowLabelWidth: (width: GanttRowLabelWidthSetting) => void
  resetToDefaults: () => void
}

const DEFAULT_LAYOUT_STATE = {
  workLoggerLayout: WorkLoggerLayoutMode.Stacked,
  swimLaneDayCount: 'auto' as const,
  ganttRowLabelWidth: 'auto' as const,
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      // Initial state - all 'auto' to respect breakpoint defaults
      ...DEFAULT_LAYOUT_STATE,

      /**
       * Set the Work Logger layout mode.
       * - Stacked: Default vertical stacking
       * - SideBySide: Clock + LinearTimeline horizontal
       * - ClockSidebar: Clock as sticky sidebar
       */
      setWorkLoggerLayout: (layout: WorkLoggerLayoutMode): void => {
        set({ workLoggerLayout: layout })
      },

      /**
       * Set the SwimLane day count.
       * Use 'auto' for intelligent breakpoint-based defaults:
       * - Standard: 3 days
       * - Ultra-wide (2560px+): 5 days
       * - Super ultra-wide (3440px+): 7 days
       */
      setSwimLaneDayCount: (count: SwimLaneDayCountSetting): void => {
        set({ swimLaneDayCount: count })
      },

      /**
       * Set the Gantt chart row label width.
       * Use 'auto' for intelligent breakpoint-based defaults:
       * - Standard: 180px
       * - Ultra-wide (2560px+): 220px
       * - Super ultra-wide (3440px+): 280px
       */
      setGanttRowLabelWidth: (width: GanttRowLabelWidthSetting): void => {
        set({ ganttRowLabelWidth: width })
      },

      /**
       * Reset all layout preferences to defaults.
       */
      resetToDefaults: (): void => {
        set(DEFAULT_LAYOUT_STATE)
      },
    }),
    {
      name: 'layout-preferences', // localStorage key
    },
  ),
)

// ============================================================================
// Custom Hooks for Common Patterns
// ============================================================================

/**
 * Get the current Work Logger layout mode.
 */
export function useWorkLoggerLayout(): WorkLoggerLayoutMode {
  return useLayoutStore((state) => state.workLoggerLayout)
}

/**
 * Get the current SwimLane day count setting.
 */
export function useSwimLaneDayCount(): SwimLaneDayCountSetting {
  return useLayoutStore((state) => state.swimLaneDayCount)
}

/**
 * Get the current Gantt row label width setting.
 */
export function useGanttRowLabelWidth(): GanttRowLabelWidthSetting {
  return useLayoutStore((state) => state.ganttRowLabelWidth)
}

// Export types for external use
export type { SwimLaneDayCountSetting, GanttRowLabelWidthSetting }
