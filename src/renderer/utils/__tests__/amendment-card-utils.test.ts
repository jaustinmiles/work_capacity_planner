/**
 * Tests for Amendment Card Utilities
 */

import { describe, it, expect } from 'vitest'
import { AmendmentType } from '@shared/enums'
import {
  getAmendmentIconType,
  getAmendmentColor,
  getAmendmentStatusFlags,
  formatWorkflowSteps,
  formatDuration,
  getCardBorderColor,
  getCardBackgroundColor,
  getCardOpacity,
  MAX_PREVIEW_STEPS,
} from '../amendment-card-utils'

describe('amendment-card-utils', () => {
  describe('getAmendmentIconType', () => {
    it('should return "plus" for TaskCreation', () => {
      expect(getAmendmentIconType(AmendmentType.TaskCreation)).toBe('plus')
    })

    it('should return "plus" for WorkflowCreation', () => {
      expect(getAmendmentIconType(AmendmentType.WorkflowCreation)).toBe('plus')
    })

    it('should return "check" for StatusUpdate', () => {
      expect(getAmendmentIconType(AmendmentType.StatusUpdate)).toBe('check')
    })

    it('should return "clock" for DurationChange', () => {
      expect(getAmendmentIconType(AmendmentType.DurationChange)).toBe('clock')
    })

    it('should return "clock" for TimeLog', () => {
      expect(getAmendmentIconType(AmendmentType.TimeLog)).toBe('clock')
    })

    it('should return "calendar" for WorkPatternModification', () => {
      expect(getAmendmentIconType(AmendmentType.WorkPatternModification)).toBe('calendar')
    })

    it('should return "calendar" for DeadlineChange', () => {
      expect(getAmendmentIconType(AmendmentType.DeadlineChange)).toBe('calendar')
    })

    it('should return "list" for StepAddition', () => {
      expect(getAmendmentIconType(AmendmentType.StepAddition)).toBe('list')
    })

    it('should return "list" for StepRemoval', () => {
      expect(getAmendmentIconType(AmendmentType.StepRemoval)).toBe('list')
    })

    it('should return "edit" for NoteAddition', () => {
      expect(getAmendmentIconType(AmendmentType.NoteAddition)).toBe('edit')
    })

    it('should return "edit" for PriorityChange', () => {
      expect(getAmendmentIconType(AmendmentType.PriorityChange)).toBe('edit')
    })

    it('should return "edit" for TypeChange', () => {
      expect(getAmendmentIconType(AmendmentType.TypeChange)).toBe('edit')
    })

    it('should return "bulb" for DependencyChange', () => {
      expect(getAmendmentIconType(AmendmentType.DependencyChange)).toBe('bulb')
    })

    it('should return "bulb" for ArchiveToggle', () => {
      expect(getAmendmentIconType(AmendmentType.ArchiveToggle)).toBe('bulb')
    })

    it('should return "bulb" for WorkSessionEdit', () => {
      expect(getAmendmentIconType(AmendmentType.WorkSessionEdit)).toBe('bulb')
    })

    it('should return "bulb" for QueryResponse', () => {
      expect(getAmendmentIconType(AmendmentType.QueryResponse)).toBe('bulb')
    })

    it('should return "bulb" for TaskTypeCreation', () => {
      expect(getAmendmentIconType(AmendmentType.TaskTypeCreation)).toBe('bulb')
    })
  })

  describe('getAmendmentColor', () => {
    it('should return "arcoblue" for TaskCreation', () => {
      expect(getAmendmentColor(AmendmentType.TaskCreation)).toBe('arcoblue')
    })

    it('should return "arcoblue" for WorkflowCreation', () => {
      expect(getAmendmentColor(AmendmentType.WorkflowCreation)).toBe('arcoblue')
    })

    it('should return "green" for StatusUpdate', () => {
      expect(getAmendmentColor(AmendmentType.StatusUpdate)).toBe('green')
    })

    it('should return "purple" for WorkPatternModification', () => {
      expect(getAmendmentColor(AmendmentType.WorkPatternModification)).toBe('purple')
    })

    it('should return "orangered" for DurationChange', () => {
      expect(getAmendmentColor(AmendmentType.DurationChange)).toBe('orangered')
    })

    it('should return "orangered" for TimeLog', () => {
      expect(getAmendmentColor(AmendmentType.TimeLog)).toBe('orangered')
    })

    it('should return "gray" for NoteAddition', () => {
      expect(getAmendmentColor(AmendmentType.NoteAddition)).toBe('gray')
    })

    it('should return "gray" for other amendment types', () => {
      expect(getAmendmentColor(AmendmentType.PriorityChange)).toBe('gray')
      expect(getAmendmentColor(AmendmentType.TypeChange)).toBe('gray')
      expect(getAmendmentColor(AmendmentType.DependencyChange)).toBe('gray')
    })
  })

  describe('getAmendmentStatusFlags', () => {
    it('should return correct flags for pending status', () => {
      const flags = getAmendmentStatusFlags('pending')
      expect(flags).toEqual({
        isPending: true,
        isApplied: false,
        isSkipped: false,
      })
    })

    it('should return correct flags for applied status', () => {
      const flags = getAmendmentStatusFlags('applied')
      expect(flags).toEqual({
        isPending: false,
        isApplied: true,
        isSkipped: false,
      })
    })

    it('should return correct flags for skipped status', () => {
      const flags = getAmendmentStatusFlags('skipped')
      expect(flags).toEqual({
        isPending: false,
        isApplied: false,
        isSkipped: true,
      })
    })
  })

  describe('formatWorkflowSteps', () => {
    it('should return empty arrays for empty input', () => {
      expect(formatWorkflowSteps([])).toEqual({
        visibleSteps: [],
        overflowCount: 0,
      })
    })

    it('should return empty arrays for null/undefined input', () => {
      expect(formatWorkflowSteps(null as unknown as string[])).toEqual({
        visibleSteps: [],
        overflowCount: 0,
      })
    })

    it('should return all steps when under max', () => {
      const steps = ['Step 1', 'Step 2', 'Step 3']
      expect(formatWorkflowSteps(steps)).toEqual({
        visibleSteps: ['Step 1', 'Step 2', 'Step 3'],
        overflowCount: 0,
      })
    })

    it('should return exactly MAX_PREVIEW_STEPS when at limit', () => {
      const steps = Array.from({ length: MAX_PREVIEW_STEPS }, (_, i) => `Step ${i + 1}`)
      expect(formatWorkflowSteps(steps)).toEqual({
        visibleSteps: steps,
        overflowCount: 0,
      })
    })

    it('should truncate and show overflow when over max', () => {
      const steps = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7']
      const result = formatWorkflowSteps(steps)
      expect(result.visibleSteps).toHaveLength(MAX_PREVIEW_STEPS)
      expect(result.overflowCount).toBe(2)
    })

    it('should respect custom maxVisible parameter', () => {
      const steps = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5']
      const result = formatWorkflowSteps(steps, 3)
      expect(result.visibleSteps).toEqual(['Step 1', 'Step 2', 'Step 3'])
      expect(result.overflowCount).toBe(2)
    })

    it('should handle large overflow correctly', () => {
      const steps = Array.from({ length: 20 }, (_, i) => `Step ${i + 1}`)
      const result = formatWorkflowSteps(steps)
      expect(result.visibleSteps).toHaveLength(MAX_PREVIEW_STEPS)
      expect(result.overflowCount).toBe(15)
    })
  })

  describe('formatDuration', () => {
    it('should format zero minutes', () => {
      expect(formatDuration(0)).toBe('0 min')
    })

    it('should format negative minutes as zero', () => {
      expect(formatDuration(-10)).toBe('0 min')
    })

    it('should format minutes under an hour', () => {
      expect(formatDuration(30)).toBe('30 min')
      expect(formatDuration(1)).toBe('1 min')
      expect(formatDuration(59)).toBe('59 min')
    })

    it('should format exactly one hour', () => {
      expect(formatDuration(60)).toBe('1h')
    })

    it('should format multiple hours without remainder', () => {
      expect(formatDuration(120)).toBe('2h')
      expect(formatDuration(180)).toBe('3h')
    })

    it('should format hours with minutes', () => {
      expect(formatDuration(90)).toBe('1h 30min')
      expect(formatDuration(75)).toBe('1h 15min')
      expect(formatDuration(150)).toBe('2h 30min')
    })

    it('should handle large durations', () => {
      expect(formatDuration(480)).toBe('8h')
      expect(formatDuration(485)).toBe('8h 5min')
    })
  })

  describe('getCardBorderColor', () => {
    it('should return success color for applied', () => {
      expect(getCardBorderColor('applied')).toBe('var(--color-success-light-4)')
    })

    it('should return border-2 for skipped', () => {
      expect(getCardBorderColor('skipped')).toBe('var(--color-border-2)')
    })

    it('should return default border for pending', () => {
      expect(getCardBorderColor('pending')).toBe('var(--color-border)')
    })
  })

  describe('getCardBackgroundColor', () => {
    it('should return success background for applied', () => {
      expect(getCardBackgroundColor('applied')).toBe('var(--color-success-light-1)')
    })

    it('should return fill background for skipped', () => {
      expect(getCardBackgroundColor('skipped')).toBe('var(--color-fill-2)')
    })

    it('should return default background for pending', () => {
      expect(getCardBackgroundColor('pending')).toBe('var(--color-bg-1)')
    })
  })

  describe('getCardOpacity', () => {
    it('should return 0.7 for skipped', () => {
      expect(getCardOpacity('skipped')).toBe(0.7)
    })

    it('should return 1 for applied', () => {
      expect(getCardOpacity('applied')).toBe(1)
    })

    it('should return 1 for pending', () => {
      expect(getCardOpacity('pending')).toBe(1)
    })
  })

  describe('MAX_PREVIEW_STEPS constant', () => {
    it('should be defined as 5', () => {
      expect(MAX_PREVIEW_STEPS).toBe(5)
    })
  })
})
