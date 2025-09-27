# Debugging Approach

For debugging issues, follow this systematic approach:

## 1. Add Advanced Logging
Use the custom logger to add detailed logging around the problematic code:
```typescript
import { logger } from '@/shared/logger'

// Add logging before and after critical operations
logger.info('Starting operation', { context: 'specific-details' })
logger.debug('Variable state', { variable: value })
logger.info('Operation completed', { result: outcome })
```

## 2. Tail Application Logs
Use the log tailing script to monitor logs in real-time:
```bash
# Tail logs with filtering
npx tsx scripts/dev/tail-logs.ts --grep "pattern" --level info
```

## 3. Diagnose from Log Output
Analyze the log output to understand:
- What sequence of events occurred
- What values variables had at key points
- Where the issue manifested

## 4. Database Inspection (If Needed)
Query database state when logs suggest data issues:
```bash
# Inspect specific data
npx tsx scripts/dev/db-inspector.ts tasks
npx tsx scripts/dev/db-inspector.ts capacity 2024-01-15
```

## 5. Use MCP Diagnostic Tools
Access these tools through the diagnostic MCP server:
- `get_next_feedback` - Get next issue to work on
- `view_logs` - View recent or tailed logs
- `inspect_database` - Safe database queries

This approach provides systematic debugging without scattered ad-hoc tools.