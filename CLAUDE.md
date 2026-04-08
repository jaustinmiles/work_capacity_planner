# CLAUDE.md — Task Planner Development

## Operating mode

You are operating autonomously. The developer kicks off work and checks back later. Do not ask questions — resolve ambiguity through the codebase (tests, types, lint, existing patterns) and the knowledge base in `.claude/rules/`. If genuine ambiguity remains after consulting all sources, create a decision document (see Decision Protocol below) and proceed with your best judgment.

### The hermeneutic verification loop

Before and during every change, iterate between parts and whole:

1. **Understand scope** — What is the task? Which part of the system does it touch?
2. **Consult existing patterns** — Read relevant source files. How do similar features work? What conventions exist? `grep -r "pattern" src/` before creating anything.
3. **Check the knowledge base** — See `.claude/rules/` for FAQ, architectural decisions, and resolved ambiguities. Read `context/state.md` for current status. Check `feedback.json` for priority items.
4. **Implement** — Write code using MCP tools.
5. **Verify** — Run the full chain: `mcp__diagnostic__typecheck` → `mcp__diagnostic__run_lint --quiet` → `mcp__diagnostic__run_tests`. All three must pass.
6. **If verification fails** — Fix the code. Never skip tests, never weaken lint rules, never loosen type constraints.
7. **If the fix changes your understanding** — Return to step 1. Understanding the part may change your understanding of the whole.
8. **Commit** — Only after all verifications pass. Use `mcp__git__stage_files` to review, then commit with a clear message.

### Decision protocol

When you encounter genuine ambiguity (two valid approaches, unclear product intent, architectural fork):

1. Create `decisions/YYYY-MM-DD-<slug>.md` with: Context, Options (min 2), Decision, Tradeoffs, Reversibility
2. Proceed with your chosen approach.
3. Prefer: simpler → more consistent with existing patterns → more reversible. In that priority order.

### When to stop

- Task complete and all verifications pass → commit and summarize what you did.
- Blocked by missing MCP tool → document in `decisions/tool-proposals/`, commit what's complete, move on.
- Same failure after 3 hermeneutic loop iterations → commit what works, document the issue in `decisions/`, stop. Don't spiral.

---

## 🚨 CRITICAL: Database Operations

**NEVER run these commands directly via Bash:**
- `npx prisma migrate reset` — **DESTROYS ALL DATA**
- `npx prisma db push --force-reset` — **DESTROYS ALL DATA**
- `npx prisma db push` — **CAUSES MIGRATION DRIFT** (see below)
- Any raw SQL `DROP DATABASE` / `DELETE FROM` statements

### Why `prisma db push` is dangerous

`prisma db push` modifies the database schema **without** creating migration files:
- Tables/columns exist in the database but have no migration history
- Future migrations will fail with "drift detected" errors
- There's no easy way to sync migration history after the fact
- It was designed for rapid prototyping, NOT production development

**If you see "Drift detected" errors:**
1. DO NOT run `prisma migrate reset` — this destroys all data
2. Create a retroactive migration file with the SQL that matches the current state
3. Use `npx prisma migrate resolve --applied <migration_name>` to mark it applied

**ALWAYS use MCP database tools instead:**
```
mcp__database__backup_database              # Backup before schema changes
mcp__database__safe_migrate --name "name"   # Safe migration (auto-backup)
mcp__database__migration_status             # Check status (read-only)
mcp__database__list_backups                 # List available backups
mcp__database__restore_database             # Restore (requires confirm: true)
mcp__database__generate_client              # Generate Prisma client (no DB changes)
```

**Why?** Claude has destroyed user data by running `prisma migrate reset` without permission. The MCP tools enforce mandatory backups before any destructive operation.

---

## Code standards (non-negotiable)

Violating any of these means the change is not done.

### Types and safety
- No `any`, `unknown`, `never`, or type casting (`as`). If the type system fights you, the design is wrong.
- All functions must have explicit return type annotations. No inference for exported functions.
- Use enums and constants for domain concepts. Zero hardcoded strings in production code.

### Architecture
- **Business logic does not go in UI components.** Components render state. All computation (scheduling, prioritization, capacity, display derivation like colors/labels by type) lives in tested utility functions or store actions.
- **State is reactive.** Zustand stores drive everything. No page refreshes. No imperative DOM manipulation.
- **Everything is user-configurable.** Task types, schedule blocks, work hours, break patterns — all from user config. Never hardcode temporal assumptions (weekends, evenings, 9-5). Never hardcode type-specific behavior.
- **Time: use `getCurrentTime()` from `time-provider`.** Never `new Date()` directly. Never `Date.now()`.
- **IDs: use `generateUniqueId()` from `step-id-utils`.**
- **Colors: use `getTypeColor()` utilities.**
- **Logging: use `logger.ui` for UI, `logger.system` for backend.** No `console.log`.

### Clean code
- **No commented-out code.** Delete it. Git has history.
- **No unused imports/exports.** ESLint catches these.
- **No duplicate logic.** Extract to utilities immediately. If you write similar code twice, extract it.
- **Grep before creating.** Always `grep -r "pattern" src/` to find existing implementations. There is ONE scheduling engine, ONE work logger, ONE priority calculator. If you think you need a new one, you are wrong — extend the existing one.
- **Single responsibility.** Each function/component does ONE thing.
- **Explicit over implicit.** Clear naming, no magic numbers or strings.
- **Simple is better than complex.**

### Tests
- Every new function gets tests. Every bug fix gets a regression test.
- Tests must be meaningful — test behavior, not implementation details.
- Never skip, disable, or delete a failing test to make CI pass. Fix the code.
- Run tests through MCP:
```
mcp__diagnostic__run_tests                                    # All tests
mcp__diagnostic__run_test_file --file "path/to/test.ts"       # Specific file
mcp__diagnostic__run_lint --quiet                             # Lint
mcp__diagnostic__typecheck                                    # Type check
```

### Git hygiene
- Commit working code only. Full verify chain before every commit.
- Small commits with clear messages.
- Stage with `mcp__git__stage_files` to review changes before committing.
- Use `mcp__git__setup_bot_auth` for GitHub operations.
- If git PR or other git MCP methods fail, reauthenticate using the auth MCP.

---

## MCP tool extension protocol

When you need a capability that no MCP tool provides:
1. Do NOT write an ad-hoc script or Bash workaround.
2. Propose a new tool in `decisions/tool-proposals/YYYY-MM-DD-<tool-name>.md` with input schema, output format, and implementation notes.
3. If blocking, note the blocker in your commit message and move to the next task.

---

## Application architecture

### Data model hierarchy

```
Endeavors (cross-workflow dependencies, group related work)
  └── EndeavorItems (links tasks to endeavors)
  └── EndeavorDependencies (cross-task/workflow ordering)

Tasks (unified model — standalone OR workflow containers)
  hasSteps=false → simple standalone task
  hasSteps=true  → workflow container with sequenced TaskSteps
    └── TaskSteps (each has own task type, may have asyncWaitTime)

  inActiveSprint=true → included in active sprint for scheduling + prioritization

Task Types (user-defined categories — drive block matching)
Schedule Blocks (typed time slots — user configured, matched by type)
```

### Core systems

- **Scheduling engine** — Assigns prioritized tasks from active sprint to typed schedule blocks on the Gantt timeline. Respects dependencies. Matches task types to block types. Lives in `src/shared/unified-scheduler.ts`. ONE implementation — extend, never duplicate.
- **Prioritization** — Eisenhower (urgency × importance) as base. Boosted by: async wait time (parallel throughput), cognitive complexity (focus-period matching), deadline pressure (dynamic escalation).
- **Deep work board** — Whiteboard view of an endeavor. Shows all unblocked work. User starts tasks directly here, bypassing scheduling engine ordering.
- **Work status widget** — Next scheduled task from timeline. Start/stop controls. Plan vs. logged time by type. Expandable radar chart for time distribution across types.
- **Work logger** — Swim lanes by task, linear timeline (DAW-style splittable segments), clock view. All synced. Plan vs. actual uses frozen schedule snapshots.
- **Pomodoro** — Built-in timer linked to active tasks.
- **AI assistant** — In-app chat orchestrating the app via IPC actions. Peer collaborator personality. Proactive nudges.

### User story

The app serves neurodivergent users (especially ADHD) who struggle with prioritization and executive function. It spans: **Planning** (brainstorm tasks/workflows, organize into endeavors/sprints, generate typed schedules) → **Execution** (scheduler recommends next task, start/stop logging, Pomodoro, deep work board) → **Retrospective** (plan vs. actual, radar chart, estimate accuracy). The app is simultaneously a planning tool, execution orchestrator, and time analysis platform. Features that only serve one phase at the expense of others are incomplete.

### Project structure

- `/src/shared/` — Shared utilities, types, enums
- `/src/renderer/` — React UI components, Zustand stores
- `/src/main/` — Electron main process (minimal shell: tray, notifications, logging)
- `/src/server/` — Express + tRPC server, routers, middleware, Prisma client
- `/src/server/router/` — 18 domain-specific tRPC routers (aggregated in `index.ts`)
- `/scripts/` — Development and analysis tools
- `/context/` — Project state (`state.md`), feedback, insights, decisions
- `.claude/rules/` — Knowledge base for autonomous operation
- `.claude/decisions/` — Decision docs and tool proposal templates

### Technology stack

Electron · TypeScript strict · React 19 · Zustand · tRPC + Express · Prisma + SQLite · Arco Design · Tailwind CSS · Vite · Vitest · ESLint

### API layer (tRPC)

The app uses a **client-server architecture** with tRPC as the primary API layer, replacing traditional Electron IPC for data operations. This enables multi-platform support (desktop, web, iOS).

- **Server**: Express + tRPC at `src/server/`, with superjson transformer for Date serialization
- **Routers**: 18 domain routers in `src/server/router/` — task, workflow, endeavor, deepWorkBoard, pomodoro, feedback, workPattern, workSession, conversation, ai, etc.
- **Auth middleware**: Three procedure levels:
  - `publicProcedure` — no auth (health checks only)
  - `protectedProcedure` — requires valid API key (`x-api-key` header)
  - `sessionProcedure` — requires auth + active session (`x-session-id` header). Most DB operations use this.
- **Client**: `src/shared/trpc-client.ts` — httpBatchLink, superjson, sends API key + session headers
- **Adding a new router**: Create in `src/server/router/`, add to `appRouter` in `index.ts`, use `sessionProcedure` for session-scoped operations

---

## Workflow

### Starting work
1. Read this file
2. Read `context/state.md` for current status
3. Check `feedback.json` for priority items
4. Read relevant `.claude/rules/` files

### During development
- Use task tracking tools to track progress on complex tasks
- Push frequently to catch issues early
- Trust error messages — they usually point to the exact problem
- The pre-push hooks are your friend

### PR reviews
- Fetch comments with `mcp__git__get_pr_reviews`
- Address each comment systematically
- Reply with `mcp__git__reply_to_comment` after fixing

---

## Context preservation

This file is reloaded at every interaction start and survives context compaction. If your understanding of the current task feels degraded (e.g., after compaction), re-read this file and relevant `.claude/rules/` files before continuing.

After completing a significant feature or making a non-obvious decision, update the knowledge base in `.claude/rules/` so future sessions benefit from what you learned.