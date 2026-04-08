# Architectural Decisions & FAQ

This file is the knowledge base that replaces asking the developer. When you encounter uncertainty, check here first.

## Resolved decisions

### Why Zustand over Redux?
Simpler API, less boilerplate, better TypeScript integration, smaller bundle. Stores use monolithic interfaces with `subscribeWithSelector` middleware for fine-grained subscriptions.

### Why SQLite over a cloud database?
Privacy-first, offline-capable, fast local queries. The app may eventually sync, but local-first is the design principle.

### Why Arco Design?
Selected early in development for its comprehensive component set. Customized via theme tokens. Do not introduce a second component library.

### Why a time-provider abstraction?
Testability. All time-dependent logic can be tested deterministically by injecting a mock time provider. This also enables features like "preview tomorrow's schedule."

### Why tRPC over Electron IPC?
The app migrated from IPC to a client-server tRPC architecture to support multiple platforms (desktop, web, iOS). tRPC provides type-safe API access, session-scoped auth, and works over HTTP. All 18 domain routers live in `src/server/router/`.

### One scheduling engine, one logger, one of everything
There was historically a problem with duplicate implementations. There is ONE scheduling engine, ONE work logger, ONE priority calculator. If you think you need a new one, you are wrong — extend the existing one. Check `src/shared/unified-scheduler.ts` before creating anything.

## Common patterns

### Adding a new task type feature
Task types are user-defined. Never check for specific type names. Always work with the type abstraction:
- Type definitions come from the database via Prisma (`UserTaskType` model)
- Type-specific display (colors, icons, labels) goes through `src/shared/user-task-types.ts` (`getTypeColor()`, `getTypeName()`, `getTypeEmoji()`)
- Schedule block matching uses `type.id`, never `type.name`

### Adding a new view
1. Create component in `src/renderer/components/`
2. Wire to Zustand store for state
3. Navigation via the app's router (not window.location)
4. No business logic in the component — derive display state from store

### Adding a tRPC router
1. Create the router file in `src/server/router/` (follow existing patterns — see `task.ts` or `pomodoro.ts`)
2. Use `sessionProcedure` for session-scoped operations, `protectedProcedure` for session-independent operations
3. Define input schemas with Zod for type-safe validation
4. Add the router to `appRouter` in `src/server/router/index.ts`
5. The client (`src/shared/trpc-client.ts`) picks up the new router automatically via the `AppRouter` type export

### Working with the scheduling engine
The scheduler in `src/shared/unified-scheduler.ts` is the most complex part of the codebase. Key rules:
- It reads from tasks with `inActiveSprint=true`
- It places tasks into typed schedule blocks, respecting dependencies
- It does NOT modify task state — it produces a schedule object
- Modifications to scheduling logic require corresponding test updates
- The Eisenhower base + boost factors (async, complexity, deadline) are all in the priority calculator

### Working with time
- Import from `time-provider`, never use `new Date()`
- All time manipulation uses tested utility functions in `src/shared/utils/time/`
- Durations are stored in minutes as integers
- Timestamps are ISO 8601 strings in the database, Date objects in runtime

## FAQ: things Claude Code has gotten wrong before

**Q: Can I modify the ESLint config to fix a lint error?**
A: No. Fix the code.

**Q: Can I use `any` temporarily and come back to fix it?**
A: No. Get the type right now.

**Q: Should I create a new utility file for this logic?**
A: Check if an existing utility file covers this domain first. Extend before creating.

**Q: The tests are failing but my code is correct. Should I update the tests?**
A: Only if the tests are testing the OLD behavior and the behavior change is intentional. If the feature spec hasn't changed, your code is wrong, not the tests.

**Q: I need to hardcode a schedule constraint (e.g., no tasks after 6pm).**
A: No. All temporal constraints come from user-configured schedule blocks. The system has no opinion about when people work.

**Q: Can I add a dependency on a new npm package?**
A: Only if no existing dependency or built-in solution covers the need. Document why in your commit message. Prefer packages already in the project's ecosystem (React, Zustand, Prisma, dayjs).

**Q: Should I create a separate database table for this?**
A: Check if the data can be a column on an existing table or a JSON field first. New tables require Prisma migration and IPC channel updates. The cost is real.

**Q: How do I handle a feature that spans planning AND execution?**
A: This is normal. Most features do. Make sure both phases work. A scheduling feature that doesn't reflect in the work logger is incomplete. A logging feature that doesn't feed back into planning analytics is incomplete.