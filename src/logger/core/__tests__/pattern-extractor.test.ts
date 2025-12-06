import { describe, it, expect } from 'vitest'
import { PatternExtractor } from '../pattern-extractor'
import type { LogEntry } from '../../types'

// Helper to create a log entry
function createEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'Test message',
    timestamp: new Date().toISOString(),
    context: {
      scope: 'ui',
      component: 'TestComponent',
      tag: 'test',
      correlationId: 'test-123',
    },
    ...overrides,
  } as LogEntry
}

describe('PatternExtractor', () => {
  describe('extractPattern', () => {
    it('should extract pattern with scope, component, and tag', () => {
      const entry = createEntry({
        context: {
          scope: 'database',
          component: 'QueryService',
          tag: 'query',
          correlationId: 'test',
        },
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('database:QueryService:query')
    })

    it('should use default tag when not provided', () => {
      const entry = createEntry({
        context: {
          scope: 'ui',
          component: 'App',
          correlationId: 'test',
        },
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('ui:App:default')
    })

    it('should normalize timestamps in messages', () => {
      const entry = createEntry({
        message: 'Event at 2025-01-15T10:30:00.123Z completed',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<timestamp>')
      expect(pattern).not.toContain('2025-01-15')
    })

    it('should normalize UUIDs in messages', () => {
      const entry = createEntry({
        message: 'Task a1b2c3d4-e5f6-7890-abcd-ef1234567890 created',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<uuid>')
      expect(pattern).not.toContain('a1b2c3d4')
    })

    it('should normalize hex IDs in messages', () => {
      const entry = createEntry({
        message: 'Memory at 0x7f8b9c0d1e2f allocated',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<hex>')
      expect(pattern).not.toContain('0x7f8b9c0d1e2f')
    })

    it('should normalize long numeric IDs', () => {
      const entry = createEntry({
        message: 'Processing item 1234567890',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<id>')
      expect(pattern).not.toContain('1234567890')
    })

    it('should normalize durations', () => {
      const entry = createEntry({
        message: 'Operation completed in 150ms and took 2.5s total',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<duration>')
      expect(pattern).not.toContain('150ms')
      expect(pattern).not.toContain('2.5s')
    })

    it('should normalize memory sizes', () => {
      const entry = createEntry({
        message: 'Cache size: 512MB, available: 2GB',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('<size>')
      expect(pattern).not.toContain('512MB')
    })

    it('should normalize array indices', () => {
      const entry = createEntry({
        message: 'Error in items[42] at position[99]',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('[<index>]')
      expect(pattern).not.toContain('[42]')
    })

    it('should normalize counts in parentheses', () => {
      const entry = createEntry({
        message: 'Processed (500) items',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('(<count>)')
      expect(pattern).not.toContain('(500)')
    })

    it('should normalize line:col references', () => {
      const entry = createEntry({
        message: 'Error at position :123:456',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain(':<line>:<col>')
    })

    it('should keep filenames from paths', () => {
      const entry = createEntry({
        message: 'Loading /Users/test/project/src/components/App.tsx',
      })

      const pattern = PatternExtractor.extractPattern(entry)
      expect(pattern).toContain('App.tsx')
    })
  })

  describe('getPatternDescription', () => {
    it('should format pattern with scope and component', () => {
      const description = PatternExtractor.getPatternDescription('ui:Component:default:message')

      expect(description).toContain('[ui]')
      expect(description).toContain('Component')
    })

    it('should include tag when not default', () => {
      const description = PatternExtractor.getPatternDescription('db:Query:cache:cached result')

      expect(description).toContain('(cache)')
    })

    it('should exclude default tag', () => {
      const description = PatternExtractor.getPatternDescription('ui:App:default:init')

      expect(description).not.toContain('(default)')
    })

    it('should include short messages', () => {
      const description = PatternExtractor.getPatternDescription('ui:App:tag:Short msg')

      expect(description).toContain('Short msg')
    })

    it('should handle patterns with fewer than 3 parts', () => {
      const description = PatternExtractor.getPatternDescription('ab')

      expect(description).toBe('ab')
    })
  })
})
