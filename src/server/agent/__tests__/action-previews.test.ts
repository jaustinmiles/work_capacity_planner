/**
 * Tests for action preview generation
 *
 * Verifies that write tool proposals generate human-readable
 * previews for the ProposedActionCard UI.
 */

import { describe, it, expect } from 'vitest'
import { generateActionPreview } from '../action-previews'

describe('generateActionPreview', () => {
  describe('create_task', () => {
    it('should generate a preview with name, duration, and priorities', () => {
      const preview = generateActionPreview('create_task', {
        name: 'Review Q4 numbers',
        duration: 60,
        importance: 7,
        urgency: 5,
        type: 'type-123',
      })

      expect(preview.title).toBe('Create Task')
      expect(preview.description).toContain('Review Q4 numbers')
      expect(preview.description).toContain('60min')
      expect(preview.description).toContain('importance 7')
      expect(preview.details.name).toBe('Review Q4 numbers')
    })
  })

  describe('update_task', () => {
    it('should summarize updated fields', () => {
      const preview = generateActionPreview('update_task', {
        id: 'task-1',
        name: 'New Name',
        urgency: 9,
      })

      expect(preview.title).toBe('Update Task')
      expect(preview.description).toContain('name')
      expect(preview.description).toContain('urgency')
    })

    it('should list all updated fields with values', () => {
      const preview = generateActionPreview('update_task', {
        id: 'task-1',
        name: 'x',
        duration: 30,
        importance: 5,
        urgency: 5,
        notes: 'stuff',
      })

      expect(preview.description).toContain('duration → 30min')
      expect(preview.description).toContain('importance → 5/10')
    })
  })

  describe('complete_task', () => {
    it('should include actual duration when provided', () => {
      const preview = generateActionPreview('complete_task', {
        id: 'task-1',
        actualDuration: 45,
      })

      expect(preview.title).toBe('Complete Task')
      expect(preview.description).toContain('45min')
    })

    it('should have generic message without duration', () => {
      const preview = generateActionPreview('complete_task', { id: 'task-1' })
      expect(preview.description).toContain('completed')
    })
  })

  describe('create_workflow', () => {
    it('should show step count and total duration', () => {
      const preview = generateActionPreview('create_workflow', {
        name: 'Deploy process',
        steps: [
          { name: 'Build', duration: 15, type: 't1' },
          { name: 'Test', duration: 30, type: 't1' },
          { name: 'Deploy', duration: 10, type: 't2' },
        ],
        importance: 7,
        urgency: 6,
        type: 't1',
      })

      expect(preview.title).toBe('Create Workflow')
      expect(preview.description).toContain('Deploy process')
      expect(preview.description).toContain('3 steps')
      expect(preview.description).toContain('55min')
    })
  })

  describe('create_schedule', () => {
    it('should show date and block/meeting counts', () => {
      const preview = generateActionPreview('create_schedule', {
        date: '2026-04-07',
        blocks: [
          { startTime: '09:00', endTime: '12:00', typeConfig: { kind: 'single', typeId: 't1' } },
        ],
        meetings: [
          { name: 'Standup', startTime: '09:30', endTime: '09:45', type: 'meeting' },
        ],
      })

      expect(preview.title).toBe('Create Schedule')
      expect(preview.description).toContain('2026-04-07')
      expect(preview.description).toContain('1 block')
      expect(preview.description).toContain('1 meeting')
    })
  })

  describe('manage_sprint', () => {
    it('should show "Add to Sprint" when adding', () => {
      const preview = generateActionPreview('manage_sprint', {
        taskId: 'task-1',
        inActiveSprint: true,
      })

      expect(preview.title).toBe('Add to Sprint')
    })

    it('should show "Remove from Sprint" when removing', () => {
      const preview = generateActionPreview('manage_sprint', {
        taskId: 'task-1',
        inActiveSprint: false,
      })

      expect(preview.title).toBe('Remove from Sprint')
    })
  })

  describe('create_task_type', () => {
    it('should show emoji, name, and color', () => {
      const preview = generateActionPreview('create_task_type', {
        name: 'Deep Work',
        emoji: '🧠',
        color: '#4A90D9',
      })

      expect(preview.title).toBe('Create Task Type')
      expect(preview.description).toContain('🧠')
      expect(preview.description).toContain('Deep Work')
      expect(preview.description).toContain('#4A90D9')
    })
  })

  describe('unknown tool', () => {
    it('should generate a fallback preview', () => {
      const preview = generateActionPreview('some_future_tool', { foo: 'bar' })

      expect(preview.title).toBe('some_future_tool')
      expect(preview.description).toBeTruthy()
    })
  })
})
