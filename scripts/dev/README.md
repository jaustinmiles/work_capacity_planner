# Development Tools

Professional development and debugging utilities for the task planner application.

## Core Development Tools

### 🔍 log-viewer.ts
Professional log viewer with advanced filtering capabilities.

**Usage:**
```bash
npx tsx scripts/dev/log-viewer.ts [options]
```

**Options:**
- `--level <level>` - Filter by log level (debug, info, warn, error)
- `--grep <pattern>` - Filter by regex pattern
- `--since <time>` - Show logs since timeframe (30m, 1h, 4h, 5m)
- `--module <name>` - Filter by module name
- `--stats` - Show log statistics only

**Examples:**
```bash
# Show errors from last 30 minutes
npx tsx scripts/dev/log-viewer.ts --level error --since 30m

# Find scheduler-related logs
npx tsx scripts/dev/log-viewer.ts --grep "scheduler|capacity"

# Show stats breakdown
npx tsx scripts/dev/log-viewer.ts --stats
```

### 🗄️ db-inspector.ts
Database inspection tool for debugging data issues.

**Usage:**
```bash
npx tsx scripts/dev/db-inspector.ts <command> [options]
```

**Commands:**
- `session [sessionId]` - Inspect session data
- `tasks [limit]` - Show recent tasks
- `pattern <date>` - Show work pattern for date
- `capacity <date>` - Analyze capacity allocation
- `stats` - Show database statistics

**Examples:**
```bash
# Check current session
npx tsx scripts/dev/db-inspector.ts session

# Show capacity for today
npx tsx scripts/dev/db-inspector.ts capacity 2024-01-15

# Database overview
npx tsx scripts/dev/db-inspector.ts stats
```

## Legacy Tools

### 📊 coverage-by-module.js
Analyze test coverage by module.

### ⚙️ Setup Scripts
- `dev-no-watch.sh` - Run dev server without file watching
- `dev-with-logging.sh` - Run dev server with verbose logging
- `setup-git-hooks.sh` - Configure git hooks

### 📝 Log Utilities
- `tail-logs.ts` - Real-time log tailing
- `dump-logs.ts` - Export application logs
- `time-export.ts` - Export time tracking data

## When to Use These Tools

### For Debugging Scheduling Issues:
1. `log-viewer.ts --grep "scheduler|capacity"` - Find scheduling logs
2. `db-inspector.ts capacity <date>` - Check capacity allocation
3. `db-inspector.ts pattern <date>` - Verify work patterns

### For Database Issues:
1. `db-inspector.ts stats` - Get overview of data
2. `db-inspector.ts session` - Check current session state
3. `db-inspector.ts tasks 20` - Recent task data

### For Performance Issues:
1. `log-viewer.ts --level warn --since 1h` - Find warnings
2. `coverage-by-module.js` - Check test coverage
3. `tail-logs.ts` - Real-time monitoring