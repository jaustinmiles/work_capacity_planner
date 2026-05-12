/**
 * Tests for agent tool definitions
 *
 * Verifies that all tools are properly defined, categorized,
 * and have valid Anthropic Tool schema structures.
 */

import { describe, it, expect } from 'vitest'
import {
  ALL_TOOLS,
  READ_TOOLS,
  WRITE_TOOLS,
  MEMORY_TOOLS,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  TOOL_REGISTRY,
} from '../tool-definitions'

describe('agent tool definitions', () => {
  describe('tool counts', () => {
    it('should have 11 read tools', () => {
      expect(READ_TOOLS).toHaveLength(11)
    })

    it('should have 19 write tools', () => {
      expect(WRITE_TOOLS).toHaveLength(19)
    })

    it('should have 4 memory tools', () => {
      expect(MEMORY_TOOLS).toHaveLength(4)
    })

    it('should have 34 total tools', () => {
      expect(ALL_TOOLS).toHaveLength(34)
    })

    it('should have ALL_TOOLS = READ + WRITE + MEMORY with no overlap', () => {
      const readNames = new Set(READ_TOOLS.map(t => t.name))
      const writeNames = new Set(WRITE_TOOLS.map(t => t.name))
      const memoryNames = new Set(MEMORY_TOOLS.map(t => t.name))

      // No overlap between any categories
      for (const name of readNames) {
        expect(writeNames.has(name)).toBe(false)
        expect(memoryNames.has(name)).toBe(false)
      }
      for (const name of writeNames) {
        expect(memoryNames.has(name)).toBe(false)
      }

      // Combined equals ALL_TOOLS
      expect(ALL_TOOLS).toHaveLength(readNames.size + writeNames.size + memoryNames.size)
    })
  })

  describe('tool schema structure', () => {
    it('every tool should have name, description, and input_schema', () => {
      for (const tool of ALL_TOOLS) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.input_schema).toBeDefined()
        expect(tool.input_schema.type).toBe('object')
      }
    })

    it('every tool should have a description longer than 20 chars', () => {
      for (const tool of ALL_TOOLS) {
        expect(tool.description!.length).toBeGreaterThan(20)
      }
    })

    it('tool names should use snake_case', () => {
      for (const tool of ALL_TOOLS) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
      }
    })

    it('required fields in input_schema should be arrays', () => {
      for (const tool of ALL_TOOLS) {
        const schema = tool.input_schema as Record<string, unknown>
        if (schema.required) {
          expect(Array.isArray(schema.required)).toBe(true)
        }
      }
    })
  })

  describe('name sets match tool arrays', () => {
    it('READ_TOOL_NAMES should match READ_TOOLS', () => {
      expect(READ_TOOL_NAMES.size).toBe(READ_TOOLS.length)
      for (const tool of READ_TOOLS) {
        expect(READ_TOOL_NAMES.has(tool.name)).toBe(true)
      }
    })

    it('WRITE_TOOL_NAMES should match WRITE_TOOLS', () => {
      expect(WRITE_TOOL_NAMES.size).toBe(WRITE_TOOLS.length)
      for (const tool of WRITE_TOOLS) {
        expect(WRITE_TOOL_NAMES.has(tool.name)).toBe(true)
      }
    })
  })

  describe('tool registry', () => {
    it('every tool should have a registry entry', () => {
      for (const tool of ALL_TOOLS) {
        expect(TOOL_REGISTRY[tool.name]).toBeDefined()
        expect(TOOL_REGISTRY[tool.name].name).toBe(tool.name)
        expect(TOOL_REGISTRY[tool.name].statusLabel).toBeTruthy()
      }
    })

    it('read tools should be categorized as read', () => {
      for (const tool of READ_TOOLS) {
        expect(TOOL_REGISTRY[tool.name].category).toBe('read')
      }
    })

    it('write tools should be categorized as write', () => {
      for (const tool of WRITE_TOOLS) {
        expect(TOOL_REGISTRY[tool.name].category).toBe('write')
      }
    })
  })

  describe('specific tool schemas', () => {
    it('create_task should require name, duration, importance, urgency, type', () => {
      const createTask = ALL_TOOLS.find(t => t.name === 'create_task')!
      const schema = createTask.input_schema as Record<string, unknown>
      expect(schema.required).toEqual(
        expect.arrayContaining(['name', 'duration', 'importance', 'urgency', 'type']),
      )
    })

    it('get_tasks should have no required fields', () => {
      const getTasks = ALL_TOOLS.find(t => t.name === 'get_tasks')!
      const schema = getTasks.input_schema as Record<string, unknown>
      expect(schema.required).toEqual([])
    })

    it('update_task should only require id', () => {
      const updateTask = ALL_TOOLS.find(t => t.name === 'update_task')!
      const schema = updateTask.input_schema as Record<string, unknown>
      expect(schema.required).toEqual(['id'])
    })

    it('get_schedule_for_date should require date', () => {
      const tool = ALL_TOOLS.find(t => t.name === 'get_schedule_for_date')!
      const schema = tool.input_schema as Record<string, unknown>
      expect(schema.required).toEqual(['date'])
    })
  })
})
