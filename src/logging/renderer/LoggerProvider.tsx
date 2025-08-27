/**
 * React context provider for logging
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { RendererLogger } from './RendererLogger'
import { LoggerConfig, LogLevel, ILogger, LogEntry } from '../types'

interface LoggerContextValue {
  logger: ILogger
  dumpBuffer: () => LogEntry[]
  showDevTools: () => void
  hideDevTools: () => void
}

const LoggerContext = createContext<LoggerContextValue | null>(null)

interface LoggerProviderProps {
  children: React.ReactNode
  config?: Partial<LoggerConfig>
  showDevTools?: boolean
}

export function LoggerProvider({
  children,
  config,
  showDevTools = false,
}: LoggerProviderProps) {
  const loggerRef = useRef<RendererLogger | undefined>(undefined)
  const [devToolsVisible, setDevToolsVisible] = React.useState(showDevTools)

  // Initialize logger once
  if (!loggerRef.current) {
    const defaultConfig: LoggerConfig = {
      level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
      sampling: {
        errorRate: 1.0,
        warnRate: 1.0,
        infoRate: 1.0,
        debugRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,
        traceRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        adaptiveSampling: true,
        bypassInDev: true,
      },
      transports: [
        { type: 'console', enabled: process.env.NODE_ENV !== 'production' },
        { type: 'ipc', enabled: true },
      ],
      ringBufferSize: 1000,
      flushInterval: 100,
      environment: process.env.NODE_ENV as any || 'development',
    }

    loggerRef.current = RendererLogger.getInstance({ ...defaultConfig, ...config })
  }

  const logger = loggerRef.current

  // Setup error boundary integration
  useEffect(() => {
    const handleError = (event: ErrorEvent): void => {
      logger.error('Unhandled error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error?.stack,
      })

      // Dump buffer on error
      logger.dumpBuffer()
    }

    const handleRejection = (event: PromiseRejectionEvent): void => {
      logger.error('Unhandled promise rejection', {
        reason: event.reason,
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [logger])

  // Context value
  const contextValue = useMemo<LoggerContextValue>(() => ({
    logger,
    dumpBuffer: () => {
      const entries = logger.dumpBuffer()
      console.log('Buffer dump:', entries)
      return entries
    },
    showDevTools: () => setDevToolsVisible(true),
    hideDevTools: () => setDevToolsVisible(false),
  }), [logger])

  return (
    <LoggerContext.Provider value={contextValue}>
      {children}
      {devToolsVisible && process.env.NODE_ENV !== 'production' && (
        <LoggerDevTools logger={logger} onClose={() => setDevToolsVisible(false)} />
      )}
    </LoggerContext.Provider>
  )
}

/**
 * Hook to use logger in components
 */
export function useLogger(context?: Record<string, any>): ILogger {
  const loggerContext = useContext(LoggerContext)

  if (!loggerContext) {
    throw new Error('useLogger must be used within LoggerProvider')
  }

  // Return child logger with component context
  if (context) {
    return loggerContext.logger.child(context)
  }

  return loggerContext.logger
}

/**
 * Hook to get the full logger context (includes dumpBuffer, etc)
 */
export function useLoggerContext(): LoggerContextValue {
  const loggerContext = useContext(LoggerContext)

  if (!loggerContext) {
    throw new Error('useLoggerContext must be used within LoggerProvider')
  }

  return loggerContext
}

/**
 * Simple dev tools overlay (placeholder for full implementation)
 */
function LoggerDevTools({ logger, onClose }: { logger: ILogger; onClose: () => void }) {
  const [logs, setLogs] = React.useState<any[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(logger.dumpBuffer().slice(-50))
    }, 1000)

    return () => clearInterval(interval)
  }, [logger])

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '200px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      fontSize: '12px',
      fontFamily: 'monospace',
      overflow: 'auto',
      padding: '10px',
      zIndex: 999999,
    }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          background: 'red',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          cursor: 'pointer',
        }}
      >
        Close
      </button>
      <div>
        <h3 style={{ margin: '0 0 10px 0' }}>Logger Dev Tools</h3>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>
            [{LogLevel[log.level]}] {log.context.timestamp} - {log.message}
            {log.data && ' ' + JSON.stringify(log.data)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Error boundary that integrates with logger
 */
export class LoggerErrorBoundary extends React.Component<
  { children: React.ReactNode; logger: ILogger },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_error: Error): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.logger.error('React error boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
