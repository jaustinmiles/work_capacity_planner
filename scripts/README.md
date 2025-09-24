# Scripts Directory

Utility scripts for development, analysis, and maintenance tasks.

## Directory Structure

### `/analysis`
Scripts for analyzing application data and debugging issues:
- `check-eisenhower-distribution.ts` - Analyze task distribution in Eisenhower matrix
- `check-error-logs.ts` - Query and analyze error logs from database
- `check-scheduled-tasks.ts` - Inspect scheduled tasks and patterns
- `dump-logs.ts` - Export application logs
- `inspect-workblocks.ts` - Analyze work block scheduling
- `inspect-workpattern.ts` - Inspect work pattern data
- `query-eisenhower-logs.ts` - Query Eisenhower matrix related logs
- `test-bedtime-scheduling.ts` - Test evening routine scheduling
- `clean-feedback.js` - Clean feedback data
- `fix-feedback-structure.js` - Fix feedback data structure
- `feedback-utils.js` - Feedback analysis utilities

### `/database`
Database management and migration scripts:
- `backup-db.js` - Create database backups
- `restore-db.js` - Restore from backup
- `cleanup-duplicate-sessions.js` - Remove duplicate session entries
- `complete-unified-migration.js` - Complete unified task migration
- `migrate-unified-tasks.js` - Migrate to unified task model
- `db-inspect.ts` - Inspect database contents
- `inspect-session.ts` - Analyze session data
- `check-schema-divergence.ts` - Check for schema inconsistencies
- `unified-migration.sql` - SQL migration script
- `unified-migration-safe.sql` - Safe migration with rollback support
- `update-database-service.md` - Migration documentation

### `/dev`
Development and testing utilities:
- `log-viewer.ts` - Professional log viewer with filtering (--level, --grep, --since, --module)
- `db-inspector.ts` - Database inspection tool (session, tasks, pattern, capacity, stats commands)
- `tail-logs.ts` - Real-time log tailing with time filtering
- `dev-no-watch.sh` - Run dev server without file watching
- `dev-with-logging.sh` - Run dev server with verbose logging
- `setup-git-hooks.sh` - Configure git hooks
- `coverage-by-module.js` - Analyze test coverage by module

### `/pr`
Pull request and review management:
- `pr-review-tracker.ts` - Track and manage PR review feedback

## Usage

All TypeScript scripts can be run with:
```bash
npx tsx scripts/[category]/[script-name].ts [args]
```

JavaScript scripts:
```bash
node scripts/[category]/[script-name].js [args]
```

Shell scripts:
```bash
./scripts/[category]/[script-name].sh [args]
```

## Adding New Scripts

Place new scripts in the appropriate category directory. If a script doesn't fit existing categories, consider whether it warrants creating a new category or if it can be generalized to fit an existing one.