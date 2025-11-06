# CLAUDE.md - Development Guidelines

## Core Principles

1. **Quality First** - All tests, lint, and typecheck must pass before pushing
2. **Clean Code Always** - Remove dead code immediately, no commented-out code, no unused exports
3. **Use MCP Tools** - Git operations through MCP when available (mcp__git__*)
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