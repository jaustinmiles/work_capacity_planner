# CLAUDE.md - Essential Development Rules

## ABSOLUTE RULES - NO EXCEPTIONS

1. **THERE IS NO SUCH THING AS "PRE-EXISTING ERRORS"** - If lint/typecheck/tests fail, they must be fixed NOW. Never claim errors are "pre-existing" - fix ALL errors before pushing.
2. **ALL CHECKS MUST PASS** - No bypassing with --no-verify, no disabling hooks, no excuses. Every push must have clean lint, typecheck, and tests.
3. **NO SHORTCUTS** - Quality gates exist for a reason. Respect them always.

## Core Workflow Principles

1. **Feature Branches Only** - All work on feature branches, never directly on main
2. **PRs Required** - Only way to get code into main is through a PR
3. **Incremental Work** - Always do incremental work, get user input, don't tackle giant todo lists alone
4. **Scripts Not Ad-hoc** - When interacting with database or PRs, always use scripts. If scripts lack functionality, add it instead of doing something ad-hoc
5. **Bot Authentication** - Always run `./context/setup-claude-bot.sh` to get credentials for GitHub
6. **Quality Gates Always** - Ensure lint, typecheck, tests, and e2e tests pass with every change. Never use `--no-verify`. No "preexisting failure" excuses
7. **Formal Typing** - Never use 'any' as a type. Use enums instead of hardcoded strings. Everything must be formally typed
8. **Custom Logging** - Always use our custom logging system, no console.log statements
9. **Unify and Simplify** - Always search for opportunities to unify and simplify. Don't care about backwards compatibility. Clean up duplicate logic and dead code

## PR Review Protocol (MANDATORY ORDER)

**BEFORE starting review:**
0. **ALWAYS run `mcp__git__setup_bot_auth`** first - Required for fetching PR reviews
1. **Run `mcp__git__get_pr_reviews`** with PR number to fetch all comments
2. **If empty/fails** - Troubleshoot auth, NEVER ask user or try other tools

When addressing PR review comments:
1. **One by one** - No planning ahead for future comments
2. **Discuss solution** with user first
3. **Implement** the agreed solution
4. **Commit and push** the change using `mcp__git__commit_changes` and `mcp__git__push_changes`
5. **Reply to comment** with verification using `mcp__git__reply_to_comment`
6. **Only then** move to next comment

## Debugging Protocol

1. **Implement advanced logging** using custom logger
2. **Ask user** to perform sequence of actions
3. **Tail logs** and clearly diagnose the problem
4. **Review fix** with user before implementing
5. **Implement** agreed solution
6. **Let user test** and verify fix works

## Context Management

- Update `/context/state.md` after EVERY work session
- Update `/context/insights.md` with learnings
- Read ALL context files before starting work

## Feedback System

Use `feedback.json` for prioritized work items. Always check for next priority feedback before starting new work.

## Key Scripts

- `scripts/dev/tail-logs.ts` - Monitor application logs
- `scripts/analysis/feedback-utils.js` - Manage feedback items
- `scripts/dev/db-inspector.ts` - Database inspection
- `scripts/dev/pr-health-check.ts` - Pre-push validation

## Never Do

- Use `any` types or type assertions
- Skip quality checks with `--no-verify`
- Force push or `--amend` without permission
- Console.log statements in production code
- Ad-hoc database or GitHub operations
- Ask user for information that MCP tools can fetch
- Give up on MCP tools after one failed attempt without troubleshooting
- Use WebFetch, Bash, or gh CLI for GitHub data when MCP tools exist (`mcp__git__*`)

## Always Do

- Verify before claiming completion: `grep -r "pattern" src/`
- Ask when uncertain rather than assume
- Use existing patterns before creating new ones
- Small atomic commits with clear messages
- Systematic pattern fixing (find ALL instances first)

## MCP Infrastructure

The project includes Model Context Protocol (MCP) servers for systematic development workflows:

### Diagnostic Server (`scripts/mcp/diagnostic-wrapper.ts`)
- `mcp__diagnostic__get_next_feedback` - Get prioritized feedback from feedback.json
- `mcp__diagnostic__inspect_database` - Query database using db-inspector.ts
- `mcp__diagnostic__view_logs` - View application logs using log-viewer.ts

### Git Server (`scripts/mcp/git-wrapper.ts`)
- `mcp__git__setup_bot_auth` - Set up Claude bot authentication for GitHub
- `mcp__git__create_feature_branch` - Create and switch to new feature branch
- `mcp__git__commit_changes` - Add and commit changes with proper message
- `mcp__git__push_and_create_pr` - Push branch and create PR using bot auth
- `mcp__git__get_pr_reviews` - Get PR review comments for systematic addressing
- `mcp__git__reply_to_comment` - Reply to specific PR review comments
- `mcp__git__health_check` - Run PR health check using pr-health-check.ts
- `mcp__git__push_changes` - Push committed changes to current branch

These servers enable systematic, automated development workflows through Claude Code.

---

### General Tips
- please always run lint with the --quiet flag. 

*The goal is systematic, enforceable practices through infrastructure, not extensive documentation.*