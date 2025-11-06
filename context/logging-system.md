# Logging System

## Usage

### Main Process
```typescript
import { logger } from '../shared/utils/logger'
logger.system.info('Task created', { taskId: '123' })
```

### UI Components
```typescript
import { logger } from '../shared/utils/logger'
logger.ui.debug('Component rendered', { props })
```

## Rules
- **NO console.log** - Always use logger
- Use `logger.ui` for UI components
- Use `logger.system` for backend/main process
- Errors automatically go to database

## Log Levels
- `debug` - Development details
- `info` - Normal operations
- `warn` - Recoverable issues
- `error` - Failures needing attention

## Viewing Logs
- Development: Check console
- Production: Use LogViewer component
- Database: ErrorLog table stores all errors