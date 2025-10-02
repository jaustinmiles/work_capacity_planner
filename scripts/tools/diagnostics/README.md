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
Access these tools through the diagnostic MCP server (`scripts/mcp/diagnostic-wrapper.ts`):

### Available MCP Diagnostic Tools:
- **`mcp__diagnostic__get_next_feedback`** - Get prioritized feedback from feedback.json
  - Filters: `high`, `unresolved`, `summary`
  - Types: `bug`, `feature`, `improvement`
- **`mcp__diagnostic__view_logs`** - View application logs using log-viewer.ts
  - Actions: `recent`, `tail`, `search`
  - Supports level filtering and time ranges
- **`mcp__diagnostic__inspect_database`** - Query database using db-inspector.ts
  - Operations: `tasks`, `sessions`, `capacity`, `stats`, `patterns`
  - Safe read-only database access

### MCP Server Configuration
The diagnostic server is configured in `.claude/settings.json` and automatically compiles to JavaScript for Claude Code integration. This provides systematic, tool-based debugging through the Model Context Protocol instead of scattered ad-hoc scripts.

This approach provides systematic debugging without scattered ad-hoc tools.