# Logging System Documentation

## Overview
The application uses a comprehensive production-ready logging system designed for minimal performance impact while providing rich debugging capabilities.

## Architecture

### Layered Design
1. **Core Layer** - Base logging functionality
   - `Logger` - Abstract base class with batching and sampling
   - `RingBuffer` - Circular buffer holding last 1000 logs
   - `Sampler` - Intelligent adaptive sampling based on error rates
   - `StructuredLogger` - JSON structured logging with metadata

2. **Transport Layer** - Log destinations
   - `ConsoleTransport` - Development console output
   - `IPCTransport` - Cross-process communication
   - `PrismaTransport` - Database persistence for errors

3. **Process Layer** - Process-specific implementations
   - `MainLogger` - Node.js main process logger
   - `RendererLogger` - Browser renderer process logger

4. **React Layer** - React integration
   - `LoggerProvider` - Context provider
   - `useLogger` - Hook for components

## Usage

### In Main Process
```typescript
import { getMainLogger } from '../logging/index.main'
const logger = getMainLogger()

logger.info('Task created', { taskId: '123' })
logger.error('Database error', error, { operation: 'save' })
```

### In Renderer Process
```typescript
import { useLogger } from '../logging/index.renderer'

function MyComponent() {
  const logger = useLogger({ component: 'MyComponent' })
  
  logger.debug('Component rendered', { props })
  logger.error('Failed to save', error)
}
```

### Legacy Compatibility
The old logger from `src/renderer/utils/logger.ts` still works:
```typescript
import { logger } from '../utils/logger'
logger.ui.info('UI event', data)
```

## Features

### Structured Logging
Every log entry includes:
- Timestamp (ISO 8601)
- Level (ERROR, WARN, INFO, DEBUG, TRACE)
- Message
- Context (process type, session ID, user ID, source location)
- Data (sanitized custom data)
- Error details (if applicable)

### Ring Buffer
- Stores last 1000 logs in memory
- Accessible via DevTools: `__dumpLogs()`
- Automatically dumped on errors
- Minimal memory footprint

### Adaptive Sampling
Production sampling rates:
- ERROR: 100% (always logged)
- WARN: 100% (always logged)
- INFO: 80% (sampled)
- DEBUG: 20% (heavily sampled)
- TRACE: 5% (rarely logged)

When error rate increases, sampling automatically increases to capture more context.

### Database Persistence
Errors and warnings are persisted to database:
- `ErrorLog` table - Error details with full context
- `LogMetric` table - Performance metrics collected every minute

### Browser DevTools Integration
In development mode, access from browser console:
- `__dumpLogs()` - Display ring buffer contents
- `__logger` - Direct logger access
- Automatic error tracking with stack traces

## Configuration

### Environment Variables
- `NODE_ENV=production` - Enables production sampling
- `NODE_ENV=development` - Full logging with console output

### Logger Config
```typescript
{
  level: LogLevel.DEBUG,
  sampling: {
    errorRate: 1.0,
    adaptiveSampling: true,
    bypassInDev: true
  },
  ringBufferSize: 1000,
  flushInterval: 100
}
```

## Performance Considerations

### Batching
- Logs batched in 100ms intervals
- Reduces IPC overhead
- Async processing doesn't block UI

### Sampling
- Production logs heavily sampled
- Development logs not sampled
- Adaptive sampling increases during errors

### Memory Management
- Ring buffer limited to 1000 entries
- Old entries automatically discarded
- Prevents unbounded memory growth

## Debugging

### View Logs in Development
1. Open browser DevTools console
2. Run `__dumpLogs()` to see recent logs
3. Check Network tab for IPC messages

### Production Debugging
1. Check database ErrorLog table
2. Review LogMetric for performance trends
3. Enable verbose logging temporarily via config

## Migration from Legacy Logger

### Before (Legacy)
```typescript
import { logInfo, logError } from '@shared/logger'
logInfo('task', 'Task created', { id: 123 })
logError('task', 'Failed', error)
```

### After (New)
```typescript
import { useLogger } from '@logging/index.renderer'
const logger = useLogger({ component: 'TaskManager' })
logger.info('Task created', { id: 123 })
logger.error('Failed', error)
```

## Best Practices

1. **Use appropriate log levels**
   - ERROR: Unrecoverable errors requiring attention
   - WARN: Recoverable issues or deprecated usage
   - INFO: Important state changes
   - DEBUG: Detailed debugging info
   - TRACE: Very detailed trace info

2. **Include context**
   ```typescript
   logger.info('Task updated', {
     taskId: task.id,
     changes: { status: 'completed' }
   })
   ```

3. **Avoid logging sensitive data**
   - Passwords, tokens, keys are auto-redacted
   - Don't log personal user information

4. **Use child loggers for components**
   ```typescript
   const logger = useLogger({ component: 'TaskForm' })
   ```

5. **Log errors with full context**
   ```typescript
   logger.error('Database operation failed', error, {
     operation: 'save',
     table: 'tasks',
     id: taskId
   })
   ```

## Troubleshooting

### Logs not appearing in console
- Check NODE_ENV (console disabled in production)
- Verify log level threshold
- Check sampling configuration

### IPC transport not working
- Ensure electronAPI is available
- Check preload script is loaded
- Verify IPC handlers registered

### Database logs missing
- Run migrations: `npx prisma migrate deploy`
- Check Prisma connection
- Verify minLevel for PrismaTransport

### Performance issues
- Reduce log levels in production
- Enable sampling
- Decrease flush interval
- Reduce ring buffer size