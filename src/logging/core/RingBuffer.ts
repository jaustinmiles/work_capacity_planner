/**
 * Circular buffer implementation for maintaining recent logs in memory
 */

import { LogEntry, RingBufferOptions } from '../types'

export class RingBuffer {
  private buffer: (LogEntry | undefined)[]
  private writeIndex: number = 0
  private size: number
  private count: number = 0
  private onError?: (entries: LogEntry[]) => void
  private persistOnError: boolean

  constructor(options: RingBufferOptions) {
    this.size = options.size
    this.buffer = new Array(this.size)
    this.onError = options.onError
    this.persistOnError = options.persistOnError ?? true
  }

  /**
   * Add a log entry to the buffer
   */
  push(entry: LogEntry): void {
    this.buffer[this.writeIndex] = entry
    this.writeIndex = (this.writeIndex + 1) % this.size
    this.count = Math.min(this.count + 1, this.size)

    // Trigger error handler for error-level logs
    if (entry.level === 0 && this.onError) {
      this.handleError()
    }
  }

  /**
   * Get all entries in chronological order
   */
  getAll(): LogEntry[] {
    const entries: LogEntry[] = []

    if (this.count < this.size) {
      // Buffer not full yet
      for (let i = 0; i < this.count; i++) {
        const entry = this.buffer[i]
        if (entry) entries.push(entry)
      }
    } else {
      // Buffer is full, read in circular order
      for (let i = 0; i < this.size; i++) {
        const index = (this.writeIndex + i) % this.size
        const entry = this.buffer[index]
        if (entry) entries.push(entry)
      }
    }

    return entries
  }

  /**
   * Get last N entries
   */
  getLast(n: number): LogEntry[] {
    const all = this.getAll()
    return all.slice(-n)
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.size)
    this.writeIndex = 0
    this.count = 0
  }

  /**
   * Get buffer statistics
   */
  getStats(): { size: number; count: number; utilization: number } {
    return {
      size: this.size,
      count: this.count,
      utilization: (this.count / this.size) * 100,
    }
  }

  /**
   * Handle error by dumping buffer
   */
  private handleError(): void {
    if (this.onError) {
      const entries = this.getAll()
      this.onError(entries)
    }
  }

  /**
   * Manually trigger buffer dump
   */
  dump(): LogEntry[] {
    return this.getAll()
  }

  /**
   * Filter entries by level
   */
  filterByLevel(level: number): LogEntry[] {
    return this.getAll().filter(entry => entry.level <= level)
  }

  /**
   * Filter entries by time range
   */
  filterByTime(startTime: Date, endTime: Date): LogEntry[] {
    const start = startTime.getTime()
    const end = endTime.getTime()

    return this.getAll().filter(entry => {
      const entryTime = new Date(entry.context.timestamp).getTime()
      return entryTime >= start && entryTime <= end
    })
  }

  /**
   * Search entries by message content
   */
  search(query: string): LogEntry[] {
    const lowerQuery = query.toLowerCase()
    return this.getAll().filter(entry =>
      entry.message.toLowerCase().includes(lowerQuery) ||
      JSON.stringify(entry.data).toLowerCase().includes(lowerQuery),
    )
  }
}
