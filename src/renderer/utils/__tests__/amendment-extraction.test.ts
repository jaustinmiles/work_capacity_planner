/**
 * Tests for Amendment Extraction Utilities
 */

import { describe, it, expect } from 'vitest'
import { AmendmentType } from '@shared/enums'
import { ViewType } from '@shared/enums'
import {
  extractAmendmentBlocks,
  removeAmendmentTags,
  parseAmendmentJSON,
  isValidAmendment,
  isKnownAmendmentType,
  normalizeWhitespace,
  cleanResponseContent,
  generatePreview,
  getWorkPatternDescription,
  truncateText,
  capitalizeFirst,
  AMENDMENT_TAG_REGEX,
} from '../amendment-extraction'

describe('amendment-extraction', () => {
  describe('extractAmendmentBlocks', () => {
    it('should extract single amendment block', () => {
      const response = `Here's a task for you.

<amendments>
[{"type": "task_creation", "name": "Test"}]
</amendments>

Let me know if you need anything else.`

      const blocks = extractAmendmentBlocks(response)

      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toBe('[{"type": "task_creation", "name": "Test"}]')
    })

    it('should extract multiple amendment blocks', () => {
      const response = `First change:

<amendments>
[{"type": "task_creation", "name": "Task 1"}]
</amendments>

Second change:

<amendments>
[{"type": "task_creation", "name": "Task 2"}]
</amendments>`

      const blocks = extractAmendmentBlocks(response)

      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toContain('Task 1')
      expect(blocks[1]).toContain('Task 2')
    })

    it('should return empty array when no amendments', () => {
      const response = 'Just a regular message with no amendments.'
      const blocks = extractAmendmentBlocks(response)
      expect(blocks).toEqual([])
    })

    it('should ignore empty amendments tag', () => {
      // Empty amendment tags are skipped (empty string is falsy after trim)
      const response = '<amendments></amendments>'
      const blocks = extractAmendmentBlocks(response)
      expect(blocks).toEqual([])
    })

    it('should be case insensitive', () => {
      const response = '<AMENDMENTS>[{"type": "test"}]</AMENDMENTS>'
      const blocks = extractAmendmentBlocks(response)
      expect(blocks).toHaveLength(1)
    })

    it('should handle multiline JSON', () => {
      const response = `<amendments>
[
  {
    "type": "task_creation",
    "name": "Multi-line task"
  }
]
</amendments>`

      const blocks = extractAmendmentBlocks(response)

      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toContain('Multi-line task')
    })
  })

  describe('removeAmendmentTags', () => {
    it('should remove amendment tags and content', () => {
      const response = `Hello.

<amendments>
[{"type": "test"}]
</amendments>

Goodbye.`

      const result = removeAmendmentTags(response)

      expect(result).not.toContain('<amendments>')
      expect(result).not.toContain('</amendments>')
      expect(result).not.toContain('"type"')
      expect(result).toContain('Hello.')
      expect(result).toContain('Goodbye.')
    })

    it('should remove multiple amendment blocks', () => {
      const response = 'A<amendments>[1]</amendments>B<amendments>[2]</amendments>C'
      const result = removeAmendmentTags(response)
      expect(result).toBe('ABC')
    })

    it('should return unchanged string when no amendments', () => {
      const response = 'No amendments here'
      expect(removeAmendmentTags(response)).toBe('No amendments here')
    })
  })

  describe('parseAmendmentJSON', () => {
    it('should parse array of amendments', () => {
      const json = '[{"type": "task_creation"}, {"type": "status_update"}]'
      const result = parseAmendmentJSON(json)

      expect(result).toHaveLength(2)
      expect(result?.[0]).toEqual({ type: 'task_creation' })
      expect(result?.[1]).toEqual({ type: 'status_update' })
    })

    it('should wrap single object in array', () => {
      const json = '{"type": "task_creation", "name": "Test"}'
      const result = parseAmendmentJSON(json)

      expect(result).toHaveLength(1)
      expect(result?.[0]).toEqual({ type: 'task_creation', name: 'Test' })
    })

    it('should return null for invalid JSON', () => {
      expect(parseAmendmentJSON('not json')).toBeNull()
      expect(parseAmendmentJSON('{broken')).toBeNull()
      expect(parseAmendmentJSON('')).toBeNull()
    })

    it('should handle nested objects', () => {
      const json = '{"type": "status_update", "target": {"name": "Task", "confidence": 0.9}}'
      const result = parseAmendmentJSON(json)

      expect(result).toHaveLength(1)
      expect(result?.[0]).toHaveProperty('target.name', 'Task')
    })
  })

  describe('isValidAmendment', () => {
    it('should return true for object with type field', () => {
      expect(isValidAmendment({ type: 'task_creation' })).toBe(true)
      expect(isValidAmendment({ type: 'status_update', target: {} })).toBe(true)
    })

    it('should return false for null', () => {
      expect(isValidAmendment(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidAmendment(undefined)).toBe(false)
    })

    it('should return false for non-objects', () => {
      expect(isValidAmendment('string')).toBe(false)
      expect(isValidAmendment(123)).toBe(false)
      expect(isValidAmendment([])).toBe(false)
    })

    it('should return false for object without type', () => {
      expect(isValidAmendment({ name: 'Test' })).toBe(false)
      expect(isValidAmendment({})).toBe(false)
    })

    it('should return false for non-string type', () => {
      expect(isValidAmendment({ type: 123 })).toBe(false)
      expect(isValidAmendment({ type: null })).toBe(false)
    })
  })

  describe('isKnownAmendmentType', () => {
    it('should return true for known types', () => {
      expect(isKnownAmendmentType('task_creation')).toBe(true)
      expect(isKnownAmendmentType('status_update')).toBe(true)
      expect(isKnownAmendmentType('workflow_creation')).toBe(true)
      expect(isKnownAmendmentType('work_pattern_modification')).toBe(true)
    })

    it('should return false for unknown types', () => {
      expect(isKnownAmendmentType('unknown_type')).toBe(false)
      expect(isKnownAmendmentType('random')).toBe(false)
      expect(isKnownAmendmentType('')).toBe(false)
    })
  })

  describe('normalizeWhitespace', () => {
    it('should collapse 3+ newlines to 2', () => {
      expect(normalizeWhitespace('A\n\n\nB')).toBe('A\n\nB')
      expect(normalizeWhitespace('A\n\n\n\n\nB')).toBe('A\n\nB')
    })

    it('should preserve 2 newlines', () => {
      expect(normalizeWhitespace('A\n\nB')).toBe('A\n\nB')
    })

    it('should preserve single newlines', () => {
      expect(normalizeWhitespace('A\nB')).toBe('A\nB')
    })

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  Hello  ')).toBe('Hello')
      expect(normalizeWhitespace('\n\nHello\n\n')).toBe('Hello')
    })

    it('should handle empty string', () => {
      expect(normalizeWhitespace('')).toBe('')
    })
  })

  describe('cleanResponseContent', () => {
    it('should remove amendments and normalize whitespace', () => {
      const response = `Hello.


<amendments>[{"type": "test"}]</amendments>



Goodbye.`

      const result = cleanResponseContent(response)

      expect(result).toBe('Hello.\n\nGoodbye.')
    })

    it('should handle response with no amendments', () => {
      const response = 'Just text\n\n\n\nwith extra newlines'
      expect(cleanResponseContent(response)).toBe('Just text\n\nwith extra newlines')
    })
  })

  describe('generatePreview', () => {
    describe('TaskCreation', () => {
      it('should generate task creation preview', () => {
        const amendment = {
          type: AmendmentType.TaskCreation,
          name: 'Test Task',
          duration: 30,
          importance: 7,
          urgency: 5,
          taskType: 'focused',
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Create Task')
        expect(preview.description).toBe('"Test Task" (30 min)')
        expect(preview.targetView).toBe(ViewType.Tasks)
        expect(preview.details).toEqual({
          name: 'Test Task',
          duration: 30,
          importance: 7,
          urgency: 5,
        })
      })
    })

    describe('WorkflowCreation', () => {
      it('should generate workflow creation preview', () => {
        const amendment = {
          type: AmendmentType.WorkflowCreation,
          name: 'Test Workflow',
          steps: [
            { name: 'Step 1', duration: 15 },
            { name: 'Step 2', duration: 30 },
          ],
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Create Workflow')
        expect(preview.description).toBe('"Test Workflow" with 2 steps')
        expect(preview.targetView).toBe(ViewType.Workflows)
        expect(preview.details.estimatedDuration).toBe(45)
      })

      it('should handle workflow with no steps', () => {
        const amendment = {
          type: AmendmentType.WorkflowCreation,
          name: 'Empty Workflow',
          steps: undefined,
        }

        const preview = generatePreview(amendment as any)

        expect(preview.description).toBe('"Empty Workflow" with 0 steps')
      })
    })

    describe('StatusUpdate', () => {
      it('should generate status update preview', () => {
        const amendment = {
          type: AmendmentType.StatusUpdate,
          target: { name: 'My Task', type: 'task', confidence: 0.9 },
          newStatus: 'in_progress',
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Update Status')
        expect(preview.description).toBe('Set "My Task" to in_progress')
        expect(preview.targetView).toBe(ViewType.Tasks)
      })
    })

    describe('TimeLog', () => {
      it('should generate time log preview', () => {
        const amendment = {
          type: AmendmentType.TimeLog,
          target: { name: 'Task', type: 'task', confidence: 1 },
          duration: 45,
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Log Time')
        expect(preview.description).toBe('Log 45 min to "Task"')
        expect(preview.targetView).toBe(ViewType.Timeline)
      })
    })

    describe('NoteAddition', () => {
      it('should generate note addition preview with truncation', () => {
        const longNote =
          'This is a very long note that exceeds fifty characters and should be truncated'
        const amendment = {
          type: AmendmentType.NoteAddition,
          target: { name: 'Task', type: 'task', confidence: 1 },
          note: longNote,
          append: true,
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Add Note')
        // truncateText(note, 50) returns first 50 chars + '...'
        expect(preview.details.note).toBe(
          'This is a very long note that exceeds fifty charac...',
        )
      })
    })

    describe('WorkPatternModification', () => {
      it('should generate add_block preview', () => {
        const amendment = {
          type: AmendmentType.WorkPatternModification,
          date: '2025-01-13',
          operation: 'add_block' as const,
          blockData: { type: 'focused', startTime: '', endTime: '' },
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Modify Schedule')
        expect(preview.description).toBe('Add focused block')
        expect(preview.targetView).toBe(ViewType.Schedule)
      })

      it('should generate add_meeting preview', () => {
        const amendment = {
          type: AmendmentType.WorkPatternModification,
          date: '2025-01-13',
          operation: 'add_meeting' as const,
          meetingData: { name: 'Team Standup' },
        }

        const preview = generatePreview(amendment as any)

        expect(preview.description).toBe('Add meeting: Team Standup')
      })
    })

    describe('ArchiveToggle', () => {
      it('should show Archive for archive=true', () => {
        const amendment = {
          type: AmendmentType.ArchiveToggle,
          target: { name: 'Old Task', type: 'task', confidence: 1 },
          archive: true,
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Archive')
        expect(preview.description).toBe('Archive "Old Task"')
      })

      it('should show Unarchive for archive=false', () => {
        const amendment = {
          type: AmendmentType.ArchiveToggle,
          target: { name: 'Restored Task', type: 'task', confidence: 1 },
          archive: false,
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Unarchive')
        expect(preview.description).toBe('Unarchive "Restored Task"')
      })
    })

    describe('TaskTypeCreation', () => {
      it('should generate task type creation preview', () => {
        const amendment = {
          type: AmendmentType.TaskTypeCreation,
          name: 'Deep Work',
          emoji: '🎯',
          color: '#4A90D9',
        }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Create Task Type')
        expect(preview.description).toBe('Create "Deep Work" type with 🎯')
        expect(preview.targetView).toBeUndefined()
      })
    })

    describe('Unknown type', () => {
      it('should return default preview for unknown type', () => {
        const amendment = { type: 'unknown_type' }

        const preview = generatePreview(amendment as any)

        expect(preview.title).toBe('Amendment')
        expect(preview.description).toBe('Proposed change')
      })
    })
  })

  describe('getWorkPatternDescription', () => {
    it('should describe add_block with type', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'add_block' as const,
        blockData: { type: 'admin' },
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Add admin block')
    })

    it('should describe add_block without data', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'add_block' as const,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Add work block')
    })

    it('should describe remove_block', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'remove_block' as const,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Remove work block')
    })

    it('should describe modify_block', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'modify_block' as const,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Modify work block')
    })

    it('should describe add_meeting with name', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'add_meeting' as const,
        meetingData: { name: '1:1 with Manager' },
      }

      expect(getWorkPatternDescription(amendment as any)).toBe(
        'Add meeting: 1:1 with Manager',
      )
    })

    it('should describe add_meeting without data', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'add_meeting' as const,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Add meeting')
    })

    it('should describe remove_meeting', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'remove_meeting' as const,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Remove meeting')
    })

    it('should default to modify schedule', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        operation: 'unknown_op' as any,
      }

      expect(getWorkPatternDescription(amendment as any)).toBe('Modify schedule')
    })
  })

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      expect(truncateText('Hello', 10)).toBe('Hello')
    })

    it('should truncate long text and add ellipsis', () => {
      expect(truncateText('Hello World', 5)).toBe('Hello...')
    })

    it('should handle exact length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello')
    })

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('')
    })
  })

  describe('capitalizeFirst', () => {
    it('should capitalize first letter', () => {
      expect(capitalizeFirst('hello')).toBe('Hello')
    })

    it('should handle already capitalized', () => {
      expect(capitalizeFirst('Hello')).toBe('Hello')
    })

    it('should handle single character', () => {
      expect(capitalizeFirst('a')).toBe('A')
    })

    it('should handle empty string', () => {
      expect(capitalizeFirst('')).toBe('')
    })

    it('should preserve rest of string', () => {
      expect(capitalizeFirst('hELLO wORLD')).toBe('HELLO wORLD')
    })
  })

  describe('AMENDMENT_TAG_REGEX', () => {
    it('should be a valid regex', () => {
      expect(AMENDMENT_TAG_REGEX).toBeInstanceOf(RegExp)
    })

    it('should have global and case-insensitive flags', () => {
      expect(AMENDMENT_TAG_REGEX.flags).toContain('g')
      expect(AMENDMENT_TAG_REGEX.flags).toContain('i')
    })
  })
})
