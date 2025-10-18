# Logger System

A structured logging system with decorators for the Work Capacity Planner application.

## Overview

This logging system provides:
- Scoped loggers for different parts of the application
- Method decorators for automatic logging
- Pattern detection and aggregation
- TypeScript Stage 3 decorator support

## Core Components

### Scopes
- `UI` - Frontend/React components
- `Database` - Database operations
- `System` - Main process and system operations
- `FileSystem` - File operations
- `Store` - State management

### Log Levels
- `ERROR` (0) - Critical errors
- `WARN` (1) - Warning conditions
- `INFO` (2) - Informational messages
- `DEBUG` (3) - Debug information
- `TRACE` (4) - Detailed trace information

## Using Decorators

We use TypeScript Stage 3 decorators (no `experimentalDecorators` needed).

### Basic Logging
```typescript
import { logged } from '../logger/decorators'
import { LogScope } from '../logger'

class MyService {
  @logged({ scope: LogScope.Database })
  async fetchData() {
    // Automatically logs: → fetchData
    const data = await db.query()
    // Automatically logs: ← fetchData
    return data
  }
}
```

### Verbose Logging with Arguments
```typescript
import { loggedVerbose } from '../logger/decorators'

class TaskService {
  @loggedVerbose({
    scope: LogScope.Database,
    logArgs: true,      // Log method arguments
    logResult: false,    // Don't log return value
    tag: 'createTask'
  })
  async createTask(taskData: TaskInput) {
    // Logs arguments and execution time
    return await db.create(taskData)
  }
}
```

### Async Operation Tracking
```typescript
import { trackedAsync } from '../logger/decorators-async'

class DataService {
  @trackedAsync({
    scope: LogScope.Database,
    warnAfterMs: 1000,  // Warn if takes > 1 second
    tag: 'slowQuery'
  })
  async performComplexQuery() {
    // Tracks async operation with timing warnings
    return await complexDatabaseOperation()
  }
}
```

## Direct Logger Usage

When decorators aren't suitable:

```typescript
import { getScopedLogger } from '../logger/scope-helper'
import { LogScope } from '../logger'

const logger = getScopedLogger(LogScope.System)

logger.info('Application started')
logger.error('Failed to connect', { error: err.message })
logger.debug('Processing item', { id: item.id })
```

## Configuration

The logger is configured in `src/logger/index.ts`:

```typescript
const loggerInstance = Logger.getInstance({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableDecorators: true,
  enableStackTrace: true,
  enableConsole: true,
  enableAggregation: true,
  aggregationWindowMs: 1000,
})
```

## Testing

The decorators are tested in actual usage:
- `src/main/database.ts` - Uses `@logged` and `@loggedVerbose`
- `src/logger/test-logger.ts` - Basic test harness

## Files

- `index.ts` - Main entry point and configuration
- `decorators.ts` - Stage 3 method decorators
- `decorators-async.ts` - Async-specific decorators
- `decorators-class.ts` - Class-level decorators
- `core/logger.ts` - Core logger implementation
- `core/transport.ts` - Console output transport
- `scope-helper.ts` - Scoped logger factory
- `utils/` - Utility functions

## Notes

- We use Stage 3 decorators (TypeScript 5+), not legacy decorators
- Decorators automatically handle both sync and async methods
- Pattern detection helps identify and suppress duplicate logs
- All production logging should use scoped loggers, not console.log