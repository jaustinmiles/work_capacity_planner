/**
 * Prisma transport for persistent error logging
 */

import { LogEntry, LogLevel } from '../types'
import type { PrismaClient } from '@prisma/client'

export class PrismaTransport {
  private prisma: PrismaClient | null = null
  private enabled: boolean
  private minLevel: LogLevel
  private batchSize: number = 10
  private batchTimeout: number = 5000
  private batch: LogEntry[] = []
  private batchTimer?: NodeJS.Timeout
  private metricsInterval?: NodeJS.Timeout

  constructor(options: {
    enabled?: boolean
    minLevel?: LogLevel
    prisma?: PrismaClient
  } = {}) {
    this.enabled = options.enabled ?? true
    this.minLevel = options.minLevel ?? LogLevel.WARN
    this.prisma = options.prisma ?? null

    if (this.enabled && this.prisma) {
      this.startMetricsCollection()
    }
  }

  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma
    if (this.enabled && !this.metricsInterval) {
      this.startMetricsCollection()
    }
  }

  write(entries: LogEntry[]): void {
    if (!this.enabled || !this.prisma) return

    // Filter entries by level
    const filteredEntries = entries.filter(entry => entry.level <= this.minLevel)

    if (filteredEntries.length === 0) return

    // Add to batch
    this.batch.push(...filteredEntries)

    // Flush if batch is full or contains errors
    const hasErrors = filteredEntries.some(e => e.level === LogLevel.ERROR)
    if (this.batch.length >= this.batchSize || hasErrors) {
      this.flush()
    } else {
      this.scheduleBatchFlush()
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) return

    this.batchTimer = setTimeout(() => {
      this.flush()
      this.batchTimer = undefined
    }, this.batchTimeout)
  }

  private async flush(): Promise<void> {
    if (this.batch.length === 0 || !this.prisma) return

    const entriesToSave = [...this.batch]
    this.batch = []

    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = undefined
    }

    try {
      // Save error logs
      const errorLogs = entriesToSave
        .filter(entry => entry.level <= LogLevel.WARN)
        .map(entry => ({
          level: LogLevel[entry.level],
          message: entry.message,
          context: entry.context,
          error: entry.error,
          sessionId: entry.context.sessionId,
          userId: entry.context.userId,
        }))

      if (errorLogs.length > 0) {
        await this.prisma.errorLog.createMany({
          data: errorLogs as any,
        })
      }
    } catch (error) {
      console.error('Failed to save logs to database:', error)
    }
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(() => {
      this.collectMetrics()
    }, 60000)

    if (this.metricsInterval.unref) {
      this.metricsInterval.unref()
    }
  }

  private async collectMetrics(): Promise<void> {
    if (!this.prisma) return

    try {
      const metrics = {
        processType: (process as any).type || 'main',
        memoryUsage: JSON.stringify(process.memoryUsage()),  // Convert to string
        cpuUsage: process.cpuUsage().user / 1000000,
        logCount: 0, // This would need to be tracked
        errorCount: 0, // This would need to be tracked
      }

      await this.prisma.logMetric.create({
        data: metrics,
      })
    } catch (error) {
      console.error('Failed to save metrics:', error)
    }
  }

  async close(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }

    await this.flush()
  }
}
