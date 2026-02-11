# CLAUDE.md - Development Guidelines

## 🚨 CRITICAL: Database Operations

**NEVER run these commands directly via Bash:**
- `npx prisma migrate reset` - **DESTROYS ALL DATA**
- `npx prisma db push --force-reset` - **DESTROYS ALL DATA**
- `npx prisma db push` - **CAUSES MIGRATION DRIFT** (see below)
- Any raw SQL `DROP DATABASE` / `DELETE FROM` statements

### Why `prisma db push` is Dangerous

`prisma db push` modifies the database schema **without** creating migration files:
- Tables/columns exist in the database but have no migration history
- Future migrations will fail with "drift detected" errors
- There's no easy way to sync migration history after the fact
- It was designed for rapid prototyping, NOT production development

**If you see "Drift detected" errors:**
1. DO NOT run `prisma migrate reset` - this destroys all data
2. Create a retroactive migration file with the SQL that matches the current state
3. Use `npx prisma migrate resolve --applied <migration_name>` to mark it applied

**ALWAYS use MCP database tools instead:**
```bash
# Create backup before any schema changes
mcp__database__backup_database

# Run migrations SAFELY (auto-backs up first)
mcp__database__safe_migrate --name "migration_name"

# Check migration status (read-only)
mcp__database__migration_status

# List available backups
mcp__database__list_backups

# Restore from backup (requires confirm: true)
mcp__database__restore_database --backupName "backup_name.db" --confirm true

# Generate Prisma client (no DB changes)
mcp__database__generate_client
```

**Why?** Claude has destroyed user data by running `prisma migrate reset` without permission. The MCP tools enforce mandatory backups before any destructive operation.

---

## Core Principles

1. **Quality First** - All tests, lint, and typecheck must pass before pushing
2. **Clean Code Always** - Remove dead code immediately, no commented-out code, no unused exports
3. **Use MCP Tools** - Git and database operations through MCP when available
4. **Type Safety** - No `any` types, use enums over string literals
5. **Small Commits** - Commit frequently with clear messages

## Clean Code Standards

### MANDATORY - Remove Dead Code
- **No commented-out code** - Delete it, git has history
- **No unused imports/exports** - ESLint will catch these
- **No duplicate logic** - Extract to utilities immediately
- **No console.log** - Use logger.ui or logger.system
- **Grep before creating** - Always search for existing patterns: `grep -r "pattern" src/`

### Design Principles
- **DRY (Don't Repeat Yourself)** - If you write similar code twice, extract it
- **Single Responsibility** - Each function/component does ONE thing well
- **Prefer Composition** - Small, composable utilities over large monoliths
- **Explicit over Implicit** - Clear naming, no magic numbers/strings

## Testing with MCP

Always run tests through MCP tools for consistency:
```bash
# Run all tests
mcp__diagnostic__run_tests

# Run specific test file
mcp__diagnostic__run_test_file --file "src/shared/__tests__/scheduler.test.ts"

# Run linting (always with --quiet)
mcp__diagnostic__run_lint --quiet

# Run typecheck
mcp__diagnostic__typecheck
```

## Workflow

### Starting Work
- Read context/state.md for current status
- Check feedback.json for priority items
- Use `mcp__git__setup_bot_auth` for GitHub operations

### During Development
- Use TodoWrite to track progress on complex tasks
- Push frequently to catch issues early
- Use existing utilities and patterns before creating new ones
- Trust error messages - they usually point to the exact problem
- Stage files with `mcp__git__stage_files` to review changes before committing

### PR Reviews
- Fetch comments with `mcp__git__get_pr_reviews`
- Address each comment systematically
- Reply to comments with `mcp__git__reply_to_comment` after fixing

## Key Tools

- **Logging**: Use logger.ui for UI components, logger.system for backend
- **IDs**: Use generateUniqueId() from step-id-utils
- **Time**: Use getCurrentTime() from time-provider, not Date.now()
- **Colors**: Use getTypeColor() utilities for consistency

## Project Structure

- `/src/shared/` - Shared utilities and types
- `/src/renderer/` - UI components
- `/src/main/` - Electron main process
- `/scripts/` - Development and analysis tools
- `/context/` - Project state and insights

## Remember

- Simple is better than complex
- Ask when uncertain rather than assume
- The pre-push hooks are your friend
- When in doubt, grep first: `grep -r "pattern" src/`

---

*Updated 2025-11-06 - Simplified for clarity*