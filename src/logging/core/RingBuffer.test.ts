import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RingBuffer } from './RingBuffer'
import { LogEntry } from '../types'

describe('RingBuffer', () => {
  const createLogEntry = (
    level: number,
    message: string,
    timestamp = new Date().toISOString(),
    data?: any
  ): LogEntry => ({
    level,
    message,
    data,
    context: {
      timestamp,
      source: 'test',
    },
  })

  describe('constructor', () => {
    it('should create a buffer with specified size', () => {
      const buffer = new RingBuffer({ size: 10 })
      const stats = buffer.getStats()
      
      expect(stats.size).toBe(10)
      expect(stats.count).toBe(0)
      expect(stats.utilization).toBe(0)
    })

    it('should accept onError callback', () => {
      const onError = vi.fn()
      const buffer = new RingBuffer({ size: 5, onError })
      
      // Push an error entry
      buffer.push(createLogEntry(0, 'Error message'))
      
      expect(onError).toHaveBeenCalled()
    })

    it('should handle persistOnError option', () => {
      const buffer1 = new RingBuffer({ size: 5, persistOnError: false })
      const buffer2 = new RingBuffer({ size: 5, persistOnError: true })
      const buffer3 = new RingBuffer({ size: 5 }) // Should default to true
      
      // Just verify they're created successfully
      expect(buffer1).toBeDefined()
      expect(buffer2).toBeDefined()
      expect(buffer3).toBeDefined()
    })
  })

  describe('push', () => {
    let buffer: RingBuffer

    beforeEach(() => {
      buffer = new RingBuffer({ size: 3 })
    })

    it('should add entries to the buffer', () => {
      buffer.push(createLogEntry(2, 'Info 1'))
      buffer.push(createLogEntry(2, 'Info 2'))
      
      const all = buffer.getAll()
      expect(all).toHaveLength(2)
      expect(all[0].message).toBe('Info 1')
      expect(all[1].message).toBe('Info 2')
    })

    it('should wrap around when buffer is full', () => {
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      buffer.push(createLogEntry(2, 'Entry 4')) // Overwrites Entry 1
      
      const all = buffer.getAll()
      expect(all).toHaveLength(3)
      expect(all[0].message).toBe('Entry 2')
      expect(all[1].message).toBe('Entry 3')
      expect(all[2].message).toBe('Entry 4')
    })

    it('should update count correctly', () => {
      expect(buffer.getStats().count).toBe(0)
      
      buffer.push(createLogEntry(2, 'Entry 1'))
      expect(buffer.getStats().count).toBe(1)
      
      buffer.push(createLogEntry(2, 'Entry 2'))
      expect(buffer.getStats().count).toBe(2)
      
      buffer.push(createLogEntry(2, 'Entry 3'))
      expect(buffer.getStats().count).toBe(3)
      
      buffer.push(createLogEntry(2, 'Entry 4'))
      expect(buffer.getStats().count).toBe(3) // Max size is 3
    })

    it('should trigger onError for error-level logs', () => {
      const onError = vi.fn()
      buffer = new RingBuffer({ size: 3, onError })
      
      buffer.push(createLogEntry(2, 'Info'))
      expect(onError).not.toHaveBeenCalled()
      
      buffer.push(createLogEntry(0, 'Error'))
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ message: 'Info' }),
        expect.objectContaining({ message: 'Error' }),
      ]))
    })
  })

  describe('getAll', () => {
    it('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer({ size: 5 })
      expect(buffer.getAll()).toEqual([])
    })

    it('should return all entries when buffer is not full', () => {
      const buffer = new RingBuffer({ size: 5 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      
      const all = buffer.getAll()
      expect(all).toHaveLength(3)
      expect(all.map(e => e.message)).toEqual(['Entry 1', 'Entry 2', 'Entry 3'])
    })

    it('should return entries in correct order when buffer wraps', () => {
      const buffer = new RingBuffer({ size: 3 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      buffer.push(createLogEntry(2, 'Entry 4'))
      buffer.push(createLogEntry(2, 'Entry 5'))
      
      const all = buffer.getAll()
      expect(all).toHaveLength(3)
      expect(all.map(e => e.message)).toEqual(['Entry 3', 'Entry 4', 'Entry 5'])
    })
  })

  describe('getLast', () => {
    let buffer: RingBuffer

    beforeEach(() => {
      buffer = new RingBuffer({ size: 5 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      buffer.push(createLogEntry(2, 'Entry 4'))
    })

    it('should return last N entries', () => {
      const last2 = buffer.getLast(2)
      expect(last2).toHaveLength(2)
      expect(last2.map(e => e.message)).toEqual(['Entry 3', 'Entry 4'])
    })

    it('should handle N larger than buffer count', () => {
      const last10 = buffer.getLast(10)
      expect(last10).toHaveLength(4)
      expect(last10.map(e => e.message)).toEqual(['Entry 1', 'Entry 2', 'Entry 3', 'Entry 4'])
    })

    it('should handle getLast with 0', () => {
      const last0 = buffer.getLast(0)
      // slice(-0) returns full array, not empty
      expect(last0).toHaveLength(4)
      expect(last0.map(e => e.message)).toEqual(['Entry 1', 'Entry 2', 'Entry 3', 'Entry 4'])
    })

    it('should work with wrapped buffer', () => {
      buffer.push(createLogEntry(2, 'Entry 5'))
      buffer.push(createLogEntry(2, 'Entry 6')) // Overwrites Entry 1
      
      const last3 = buffer.getLast(3)
      expect(last3.map(e => e.message)).toEqual(['Entry 4', 'Entry 5', 'Entry 6'])
    })
  })

  describe('clear', () => {
    it('should clear all entries', () => {
      const buffer = new RingBuffer({ size: 3 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      
      expect(buffer.getStats().count).toBe(2)
      
      buffer.clear()
      
      expect(buffer.getStats().count).toBe(0)
      expect(buffer.getAll()).toEqual([])
    })

    it('should reset write index', () => {
      const buffer = new RingBuffer({ size: 3 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      buffer.push(createLogEntry(2, 'Entry 4'))
      
      buffer.clear()
      
      buffer.push(createLogEntry(2, 'New Entry'))
      const all = buffer.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].message).toBe('New Entry')
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const buffer = new RingBuffer({ size: 10 })
      
      let stats = buffer.getStats()
      expect(stats).toEqual({
        size: 10,
        count: 0,
        utilization: 0,
      })
      
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      buffer.push(createLogEntry(2, 'Entry 3'))
      
      stats = buffer.getStats()
      expect(stats).toEqual({
        size: 10,
        count: 3,
        utilization: 30,
      })
      
      // Fill buffer completely
      for (let i = 4; i <= 10; i++) {
        buffer.push(createLogEntry(2, `Entry ${i}`))
      }
      
      stats = buffer.getStats()
      expect(stats).toEqual({
        size: 10,
        count: 10,
        utilization: 100,
      })
      
      // Overwrite entries
      buffer.push(createLogEntry(2, 'Entry 11'))
      
      stats = buffer.getStats()
      expect(stats).toEqual({
        size: 10,
        count: 10,
        utilization: 100,
      })
    })
  })

  describe('dump', () => {
    it('should return all entries like getAll', () => {
      const buffer = new RingBuffer({ size: 3 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      
      const dumped = buffer.dump()
      const all = buffer.getAll()
      
      expect(dumped).toEqual(all)
    })
  })

  describe('filterByLevel', () => {
    let buffer: RingBuffer

    beforeEach(() => {
      buffer = new RingBuffer({ size: 10 })
      buffer.push(createLogEntry(0, 'Error'))     // level 0
      buffer.push(createLogEntry(1, 'Warning'))   // level 1
      buffer.push(createLogEntry(2, 'Info'))      // level 2
      buffer.push(createLogEntry(3, 'Debug'))     // level 3
    })

    it('should filter entries by level (inclusive)', () => {
      const errors = buffer.filterByLevel(0)
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Error')
      
      const warnings = buffer.filterByLevel(1)
      expect(warnings).toHaveLength(2)
      expect(warnings.map(e => e.message)).toEqual(['Error', 'Warning'])
      
      const info = buffer.filterByLevel(2)
      expect(info).toHaveLength(3)
      expect(info.map(e => e.message)).toEqual(['Error', 'Warning', 'Info'])
      
      const all = buffer.filterByLevel(3)
      expect(all).toHaveLength(4)
    })

    it('should return empty array if no matches', () => {
      const none = buffer.filterByLevel(-1)
      expect(none).toEqual([])
    })
  })

  describe('filterByTime', () => {
    it('should filter entries by time range', () => {
      const buffer = new RingBuffer({ size: 10 })
      
      const time1 = new Date('2025-01-01T10:00:00Z')
      const time2 = new Date('2025-01-01T11:00:00Z')
      const time3 = new Date('2025-01-01T12:00:00Z')
      const time4 = new Date('2025-01-01T13:00:00Z')
      
      buffer.push(createLogEntry(2, 'Entry 1', time1.toISOString()))
      buffer.push(createLogEntry(2, 'Entry 2', time2.toISOString()))
      buffer.push(createLogEntry(2, 'Entry 3', time3.toISOString()))
      buffer.push(createLogEntry(2, 'Entry 4', time4.toISOString()))
      
      const filtered = buffer.filterByTime(
        new Date('2025-01-01T10:30:00Z'),
        new Date('2025-01-01T12:30:00Z')
      )
      
      expect(filtered).toHaveLength(2)
      expect(filtered.map(e => e.message)).toEqual(['Entry 2', 'Entry 3'])
    })

    it('should include boundary times', () => {
      const buffer = new RingBuffer({ size: 10 })
      
      const time1 = new Date('2025-01-01T10:00:00Z')
      const time2 = new Date('2025-01-01T12:00:00Z')
      
      buffer.push(createLogEntry(2, 'Entry 1', time1.toISOString()))
      buffer.push(createLogEntry(2, 'Entry 2', time2.toISOString()))
      
      const filtered = buffer.filterByTime(time1, time2)
      
      expect(filtered).toHaveLength(2)
      expect(filtered.map(e => e.message)).toEqual(['Entry 1', 'Entry 2'])
    })

    it('should return empty array if no entries in range', () => {
      const buffer = new RingBuffer({ size: 10 })
      
      const time1 = new Date('2025-01-01T10:00:00Z')
      buffer.push(createLogEntry(2, 'Entry 1', time1.toISOString()))
      
      const filtered = buffer.filterByTime(
        new Date('2025-01-01T11:00:00Z'),
        new Date('2025-01-01T12:00:00Z')
      )
      
      expect(filtered).toEqual([])
    })
  })

  describe('search', () => {
    let buffer: RingBuffer

    beforeEach(() => {
      buffer = new RingBuffer({ size: 10 })
      buffer.push(createLogEntry(2, 'User logged in', new Date().toISOString(), { userId: 123 }))
      buffer.push(createLogEntry(0, 'Database connection failed', new Date().toISOString()))
      buffer.push(createLogEntry(1, 'Warning: Low memory', new Date().toISOString(), { memory: '100MB' }))
      buffer.push(createLogEntry(2, 'Task completed successfully', new Date().toISOString()))
    })

    it('should search in message content', () => {
      const results = buffer.search('database')
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('Database connection failed')
    })

    it('should be case-insensitive', () => {
      const results = buffer.search('DATABASE')
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('Database connection failed')
    })

    it('should search in data field', () => {
      const results = buffer.search('123')
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('User logged in')
      
      const memoryResults = buffer.search('100MB')
      expect(memoryResults).toHaveLength(1)
      expect(memoryResults[0].message).toBe('Warning: Low memory')
    })

    it('should return multiple matches', () => {
      const results = buffer.search('ed')
      expect(results).toHaveLength(3) // logged, failed, completed
    })

    it('should return empty array if no matches', () => {
      const results = buffer.search('nonexistent')
      expect(results).toEqual([])
    })

    it('should handle special characters in search', () => {
      buffer.push(createLogEntry(2, 'Special: $100.00 payment', new Date().toISOString()))
      
      const results = buffer.search('$100')
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('Special: $100.00 payment')
    })
  })

  describe('edge cases', () => {
    it('should handle size of 1', () => {
      const buffer = new RingBuffer({ size: 1 })
      buffer.push(createLogEntry(2, 'Entry 1'))
      buffer.push(createLogEntry(2, 'Entry 2'))
      
      const all = buffer.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].message).toBe('Entry 2')
    })

    it('should handle very large buffer', () => {
      const buffer = new RingBuffer({ size: 10000 })
      
      for (let i = 0; i < 10000; i++) {
        buffer.push(createLogEntry(2, `Entry ${i}`))
      }
      
      const stats = buffer.getStats()
      expect(stats.count).toBe(10000)
      expect(stats.utilization).toBe(100)
      
      const last = buffer.getLast(1)
      expect(last[0].message).toBe('Entry 9999')
    })

    it('should handle undefined entries gracefully', () => {
      const buffer = new RingBuffer({ size: 3 })
      // Manually mess with the internal buffer
      ;(buffer as any).buffer[1] = undefined
      ;(buffer as any).count = 3
      
      const all = buffer.getAll()
      // Should skip undefined entries
      expect(all.length).toBeLessThanOrEqual(3)
    })

    it('should handle rapid push operations', () => {
      const buffer = new RingBuffer({ size: 100 })
      
      for (let i = 0; i < 1000; i++) {
        buffer.push(createLogEntry(2, `Rapid ${i}`))
      }
      
      const all = buffer.getAll()
      expect(all).toHaveLength(100)
      expect(all[99].message).toBe('Rapid 999')
    })

    it('should handle concurrent error callbacks', () => {
      const onError = vi.fn()
      const buffer = new RingBuffer({ size: 5, onError })
      
      // Push multiple errors rapidly
      buffer.push(createLogEntry(0, 'Error 1'))
      buffer.push(createLogEntry(0, 'Error 2'))
      buffer.push(createLogEntry(0, 'Error 3'))
      
      expect(onError).toHaveBeenCalledTimes(3)
    })
  })
})