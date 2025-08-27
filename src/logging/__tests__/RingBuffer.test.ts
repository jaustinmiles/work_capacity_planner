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
    buffer = new RingBuffer({ size: 5 }) // Small buffer for testing
  })

  describe('add and dump', () => {
    it('should add entries to buffer', () => {
      const entry = createLogEntry(LogLevel.INFO, 'test message')
      buffer.push(entry)

      const entries = buffer.getAll()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual(entry)
    })

    it('should maintain insertion order', () => {
      const entry1 = createLogEntry(LogLevel.INFO, 'first')
      const entry2 = createLogEntry(LogLevel.WARN, 'second')
      const entry3 = createLogEntry(LogLevel.ERROR, 'third')

      buffer.push(entry1)
      buffer.push(entry2)
      buffer.push(entry3)

      const entries = buffer.getAll()
      expect(entries).toHaveLength(3)
      expect(entries[0].message).toBe('first')
      expect(entries[1].message).toBe('second')
      expect(entries[2].message).toBe('third')
    })

    it('should wrap around when buffer is full', () => {
      // Add 7 entries to a buffer of size 5
      for (let i = 1; i <= 7; i++) {
        buffer.push(createLogEntry(LogLevel.INFO, `message ${i}`))
      }

      const entries = buffer.getAll()
      expect(entries).toHaveLength(5)
      // Should contain the last 5 entries (3, 4, 5, 6, 7)
      expect(entries[0].message).toBe('message 3')
      expect(entries[1].message).toBe('message 4')
      expect(entries[2].message).toBe('message 5')
      expect(entries[3].message).toBe('message 6')
      expect(entries[4].message).toBe('message 7')
    })
  })

  describe('filtering entries', () => {
    beforeEach(() => {
      buffer.push(createLogEntry(LogLevel.DEBUG, 'debug 1'))
      buffer.push(createLogEntry(LogLevel.INFO, 'info 1'))
      buffer.push(createLogEntry(LogLevel.WARN, 'warn 1'))
      buffer.push(createLogEntry(LogLevel.ERROR, 'error 1'))
      buffer.push(createLogEntry(LogLevel.INFO, 'info 2'))
    })

    it('should allow manual filtering of entries by level', () => {
      const entries = buffer.getAll()
      const infoEntries = entries.filter(e => e.level === LogLevel.INFO)
      expect(infoEntries).toHaveLength(2)
      expect(infoEntries[0].message).toBe('info 1')
      expect(infoEntries[1].message).toBe('info 2')
    })

    it('should allow manual filtering for errors', () => {
      const entries = buffer.getAll()
      const errorEntries = entries.filter(e => e.level === LogLevel.ERROR || e.level === LogLevel.WARN)
      expect(errorEntries).toHaveLength(2)
      expect(errorEntries[0].message).toBe('warn 1')
      expect(errorEntries[1].message).toBe('error 1')
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      buffer.push(createLogEntry(LogLevel.INFO, 'test 1'))
      buffer.push(createLogEntry(LogLevel.INFO, 'test 2'))

      expect(buffer.getAll()).toHaveLength(2)

      buffer.clear()
      expect(buffer.getAll()).toHaveLength(0)
    })

    it('should allow adding after clear', () => {
      buffer.push(createLogEntry(LogLevel.INFO, 'before'))
      buffer.clear()
      buffer.push(createLogEntry(LogLevel.INFO, 'after'))

      const entries = buffer.getAll()
      expect(entries).toHaveLength(1)
      expect(entries[0].message).toBe('after')
    })
  })

  describe('buffer size management', () => {
    it('should track current number of entries', () => {
      expect(buffer.getAll()).toHaveLength(0)

      buffer.push(createLogEntry(LogLevel.INFO, 'test 1'))
      expect(buffer.getAll()).toHaveLength(1)

      buffer.push(createLogEntry(LogLevel.INFO, 'test 2'))
      expect(buffer.getAll()).toHaveLength(2)
    })

    it('should not exceed max size', () => {
      for (let i = 1; i <= 10; i++) {
        buffer.push(createLogEntry(LogLevel.INFO, `message ${i}`))
      }

      expect(buffer.getAll()).toHaveLength(5) // Max size is 5
    })
  })

  describe('manual search', () => {
    beforeEach(() => {
      buffer.push(createLogEntry(LogLevel.INFO, 'User logged in'))
      buffer.push(createLogEntry(LogLevel.ERROR, 'Database connection failed'))
      buffer.push(createLogEntry(LogLevel.WARN, 'High memory usage'))
      buffer.push(createLogEntry(LogLevel.INFO, 'User logged out'))
    })

    it('should allow manual search for entries', () => {
      const entries = buffer.getAll()
      const userEntries = entries.filter(e => e.message.includes('User'))
      expect(userEntries).toHaveLength(2)
      expect(userEntries[0].message).toContain('User')
      expect(userEntries[1].message).toContain('User')
    })

    it('should allow case insensitive search', () => {
      const entries = buffer.getAll()
      const userEntries = entries.filter(e => e.message.toLowerCase().includes('user'))
      expect(userEntries).toHaveLength(2)
    })

    it('should return empty array for no matches', () => {
      const entries = buffer.getAll()
      const notFound = entries.filter(e => e.message.includes('nonexistent'))
      expect(notFound).toHaveLength(0)
    })
  })
})
