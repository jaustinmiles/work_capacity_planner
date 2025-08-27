import { describe, it, expect, beforeEach } from 'vitest'
import { RingBuffer } from '../core/RingBuffer'
import { LogEntry, LogLevel } from '../types'

describe('RingBuffer', () => {
  let buffer: RingBuffer

  const createLogEntry = (level: LogLevel, message: string): LogEntry => ({
    level,
    message,
    context: {
      timestamp: new Date().toISOString(),
      processType: 'renderer',
    },
  })

  beforeEach(() => {
    buffer = new RingBuffer(5) // Small buffer for testing
  })

  describe('add and dump', () => {
    it('should add entries to buffer', () => {
      const entry = createLogEntry(LogLevel.INFO, 'test message')
      buffer.add(entry)

      const entries = buffer.dump()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual(entry)
    })

    it('should maintain insertion order', () => {
      const entry1 = createLogEntry(LogLevel.INFO, 'first')
      const entry2 = createLogEntry(LogLevel.WARN, 'second')
      const entry3 = createLogEntry(LogLevel.ERROR, 'third')

      buffer.add(entry1)
      buffer.add(entry2)
      buffer.add(entry3)

      const entries = buffer.dump()
      expect(entries).toHaveLength(3)
      expect(entries[0].message).toBe('first')
      expect(entries[1].message).toBe('second')
      expect(entries[2].message).toBe('third')
    })

    it('should wrap around when buffer is full', () => {
      // Add 7 entries to a buffer of size 5
      for (let i = 1; i <= 7; i++) {
        buffer.add(createLogEntry(LogLevel.INFO, `message ${i}`))
      }

      const entries = buffer.dump()
      expect(entries).toHaveLength(5)
      // Should contain the last 5 entries (3, 4, 5, 6, 7)
      expect(entries[0].message).toBe('message 3')
      expect(entries[1].message).toBe('message 4')
      expect(entries[2].message).toBe('message 5')
      expect(entries[3].message).toBe('message 6')
      expect(entries[4].message).toBe('message 7')
    })
  })

  describe('getByLevel', () => {
    beforeEach(() => {
      buffer.add(createLogEntry(LogLevel.DEBUG, 'debug 1'))
      buffer.add(createLogEntry(LogLevel.INFO, 'info 1'))
      buffer.add(createLogEntry(LogLevel.WARN, 'warn 1'))
      buffer.add(createLogEntry(LogLevel.ERROR, 'error 1'))
      buffer.add(createLogEntry(LogLevel.INFO, 'info 2'))
    })

    it('should filter entries by level', () => {
      const infoEntries = buffer.getByLevel(LogLevel.INFO)
      expect(infoEntries).toHaveLength(2)
      expect(infoEntries[0].message).toBe('info 1')
      expect(infoEntries[1].message).toBe('info 2')
    })

    it('should return empty array for non-existent level', () => {
      const traceEntries = buffer.getByLevel(LogLevel.TRACE)
      expect(traceEntries).toHaveLength(0)
    })

    it('should return all error entries', () => {
      const errorEntries = buffer.getByLevel(LogLevel.ERROR)
      expect(errorEntries).toHaveLength(1)
      expect(errorEntries[0].message).toBe('error 1')
    })
  })

  describe('getErrors', () => {
    it('should return only error and warn entries', () => {
      buffer.add(createLogEntry(LogLevel.DEBUG, 'debug'))
      buffer.add(createLogEntry(LogLevel.INFO, 'info'))
      buffer.add(createLogEntry(LogLevel.WARN, 'warning'))
      buffer.add(createLogEntry(LogLevel.ERROR, 'error'))

      const errors = buffer.getErrors()
      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('warning')
      expect(errors[1].message).toBe('error')
    })

    it('should return empty array when no errors', () => {
      buffer.add(createLogEntry(LogLevel.DEBUG, 'debug'))
      buffer.add(createLogEntry(LogLevel.INFO, 'info'))

      const errors = buffer.getErrors()
      expect(errors).toHaveLength(0)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      buffer.add(createLogEntry(LogLevel.INFO, 'test 1'))
      buffer.add(createLogEntry(LogLevel.INFO, 'test 2'))

      expect(buffer.dump()).toHaveLength(2)

      buffer.clear()
      expect(buffer.dump()).toHaveLength(0)
    })

    it('should allow adding after clear', () => {
      buffer.add(createLogEntry(LogLevel.INFO, 'before'))
      buffer.clear()
      buffer.add(createLogEntry(LogLevel.INFO, 'after'))

      const entries = buffer.dump()
      expect(entries).toHaveLength(1)
      expect(entries[0].message).toBe('after')
    })
  })

  describe('size', () => {
    it('should return current number of entries', () => {
      expect(buffer.size()).toBe(0)

      buffer.add(createLogEntry(LogLevel.INFO, 'test 1'))
      expect(buffer.size()).toBe(1)

      buffer.add(createLogEntry(LogLevel.INFO, 'test 2'))
      expect(buffer.size()).toBe(2)
    })

    it('should not exceed max size', () => {
      for (let i = 1; i <= 10; i++) {
        buffer.add(createLogEntry(LogLevel.INFO, `message ${i}`))
      }

      expect(buffer.size()).toBe(5) // Max size is 5
    })
  })

  describe('search', () => {
    beforeEach(() => {
      buffer.add(createLogEntry(LogLevel.INFO, 'User logged in'))
      buffer.add(createLogEntry(LogLevel.ERROR, 'Database connection failed'))
      buffer.add(createLogEntry(LogLevel.WARN, 'High memory usage'))
      buffer.add(createLogEntry(LogLevel.INFO, 'User logged out'))
    })

    it('should find entries containing search text', () => {
      const userEntries = buffer.search('User')
      expect(userEntries).toHaveLength(2)
      expect(userEntries[0].message).toContain('User')
      expect(userEntries[1].message).toContain('User')
    })

    it('should be case insensitive', () => {
      const userEntries = buffer.search('user')
      expect(userEntries).toHaveLength(2)
    })

    it('should return empty array for no matches', () => {
      const entries = buffer.search('nonexistent')
      expect(entries).toHaveLength(0)
    })
  })
})
