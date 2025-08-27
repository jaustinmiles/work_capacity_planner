/**
 * Comprehensive logging system type definitions
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export interface LogContext {
  correlationId?: string
  sessionId?: string
  userId?: string
  processType: 'main' | 'renderer' | 'preload'
  timestamp: string
  source?: {
    file: string
    line: number
    function?: string
  }
  performance?: {
    memory: NodeJS.MemoryUsage
    cpu?: number
  }
  [key: string]: any
}

export interface LogEntry {
  level: LogLevel
  message: string
  data?: Record<string, any>
  context: LogContext
  error?: {
    message: string
    stack?: string
    code?: string
  }
}

export interface SamplingConfig {
  errorRate: number // Always 1.0 (100%)
  warnRate: number
  infoRate: number
  debugRate: number
  traceRate: number
  adaptiveSampling: boolean
  bypassInDev: boolean
  moduleOverrides?: Record<string, Partial<SamplingRates>>
}

export interface SamplingRates {
  errorRate: number
  warnRate: number
  infoRate: number
  debugRate: number
  traceRate: number
}

export interface LoggerConfig {
  level: LogLevel
  sampling: SamplingConfig
  transports: TransportConfig[]
  ringBufferSize: number
  flushInterval: number
  environment: 'development' | 'staging' | 'production'
}

export interface TransportConfig {
  type: 'console' | 'file' | 'ipc' | 'prisma'
  enabled: boolean
  options?: Record<string, any>
}

export interface RingBufferOptions {
  size: number
  onError?: (entries: LogEntry[]) => void
  persistOnError?: boolean
}

export type LogMethod = (message: string, data?: Record<string, any>) => void
export type LazyLogData = () => Record<string, any>

export interface ILogger {
  error: LogMethod
  warn: LogMethod
  info: LogMethod
  debug: LogMethod
  trace: LogMethod

  // Child logger with additional context
  child(context: Record<string, any>): ILogger

  // Dump ring buffer
  dumpBuffer(): LogEntry[]

  // Update configuration
  configure(config: Partial<LoggerConfig>): void
}

export interface IPCLogPayload {
  type: 'log'
  entry: LogEntry
}

// Prisma model types (will be generated, but defined here for reference)
export interface ErrorLog {
  id: string
  level: string
  message: string
  context: any // JSON
  error: any // JSON
  sessionId?: string
  userId?: string
  createdAt: Date
}

export interface LogMetric {
  id: string
  timestamp: Date
  processType: string
  memoryUsage: any // JSON
  cpuUsage?: number
  logCount: number
  errorCount: number
}
