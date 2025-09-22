# Debugging Methodology

## Overview
This document outlines the systematic debugging approach used to resolve complex issues in the Task Planner application, based on the successful resolution of the work pattern scheduling bug (Sept 13, 2025).

## The Systematic Approach

### 1. Problem Statement & Observation
**First, clearly define what's wrong:**
- What is the expected behavior?
- What is the actual behavior?
- When does the issue occur?
- What are the symptoms?

**Example from our case:**
- Expected: Tasks schedule within defined work blocks (9:00-23:55)
- Actual: Tasks scheduling at 9am on Sunday despite blocks
- Symptoms: Empty calendar, "Currently in Work Block" widget not showing

### 2. Avoid Assumptions - Listen to the User
**Critical lesson:** The user has more context about their system than you do.
- Don't assume defaults are the problem
- Listen when the user corrects your understanding
- Ask clarifying questions rather than jumping to conclusions

**Example mistake we made:**
- Assumed: Issue was default 9am-5pm blocks being created
- Reality: User HAD work blocks defined, issue was capacity allocation

### 3. Database Investigation
**Query the source of truth directly:**

```typescript
// Create debug scripts to examine database state
// scripts/debug-workpatterns.ts
const patterns = await prisma.workPattern.findMany({
  where: { sessionId: activeSession.id },
  include: { WorkBlock: true, WorkMeeting: true }
})
```

**Key insights from database queries:**
- Blocks ARE saved correctly
- Multiple sessions have conflicting patterns
- Capacity values stored as JSON strings

### 4. Structured Logging with Lifecycle Tags
**Implement comprehensive logging with tags:**

```typescript
mainLogger.info('[WorkPatternLifeCycle] getWorkPattern - Query', { 
  date, 
  sessionId,
  timestamp: new Date().toISOString(),
  localTime: new Date().toLocaleTimeString('en-US', { hour12: false })
})
```

**Benefits:**
- Track data flow through the system
- Identify where transformations fail
- Correlate events across components

### 5. Follow the Data Flow
**Trace data from source to consumption:**

1. **Database** → getWorkPattern()
2. **Main Process** → IPC to renderer
3. **Renderer Hook** → useUnifiedScheduler()
4. **Scheduler** → capacity calculation
5. **UI Components** → display results

**Finding in our case:**
- Data correct at steps 1-3
- Failed at step 4: capacity miscalculation
- Result: 0 tasks scheduled

### 6. Check for System Conflicts
**Look for interference from other parts of the system:**

```bash
# Find patterns from other sessions
npx tsx scripts/debug-workpatterns.ts "session-name"
```

**Discovery:**
- 12 other sessions had conflicting patterns
- Old test data interfering with current session

### 7. Identify Root Causes

**Our bug had multiple root causes:**

1. **Capacity Calculation Bug:**
```typescript
// WRONG:
if (block.type === 'flexible') {
  focusTotal = totalMinutes
  adminTotal = 0  // Bug: no admin capacity!
}

// FIXED:
if (block.type === 'flexible') {
  focusTotal = block.capacity?.focusMinutes || totalMinutes
  adminTotal = block.capacity?.adminMinutes || totalMinutes
}
```

2. **Type Safety Issues:**
- Using `any[]` instead of proper types
- Inconsistent type definitions across components

3. **Data Conflicts:**
- Multiple sessions with patterns for same dates
- No cleanup of old test data

### 8. Fix in Priority Order

**Prioritize fixes by impact:**
1. **Critical** - Flexible block capacity (immediate user impact)
2. **Important** - Type safety (prevents future bugs)
3. **Performance** - Reduce lookahead from 30→7 days
4. **Cleanup** - Remove conflicting patterns
5. **Documentation** - Capture learnings

### 9. Verify Each Fix

**Test incrementally:**
```bash
# After each fix, verify it works
npm run typecheck
npm run lint
npm test

# Check the actual UI behavior
npm start
```

## Tools & Scripts Created

### Debug Scripts
- `scripts/debug-workpatterns.ts` - Query and export work patterns
- `scripts/cleanup-conflicting-patterns-auto.ts` - Clean up conflicts
- `scripts/verify-fixes.ts` - Verify all fixes applied

### Logging Improvements
- Added `[WorkPatternLifeCycle]` tag throughout
- Converted all console.log to unified logger
- Added structured context to all log messages

## Common Pitfalls to Avoid

1. **Don't use console.log** - Always use the unified logger
2. **Don't spread non-existent properties** - Use proper type guards
3. **Don't assume defaults** - Check actual data first
4. **Don't ignore user feedback** - They know their system
5. **Don't fix symptoms** - Find root causes

## Time Handling Best Practices

### Current Issues
- Blocks split at processing time for midnight crossings
- Complex logic scattered throughout codebase
- String times ("09:00") mixed with Date objects

### Recommended Approach
1. Store times as strings in database (current)
2. Convert to timestamps early in pipeline
3. Process using timestamps throughout
4. Only split for display in render layer

## Checklist for Future Debugging

- [ ] Clearly define the problem
- [ ] Query database directly to verify data
- [ ] Add structured logging with tags
- [ ] Follow data flow from source to display
- [ ] Check for system conflicts
- [ ] Identify ALL root causes
- [ ] Fix in priority order
- [ ] Verify each fix works
- [ ] Document findings
- [ ] Clean up test data

## Key Takeaways

1. **Listen to the user** - They have critical context
2. **Use systematic approach** - Don't guess, investigate
3. **Log everything** - With structure and tags
4. **Fix root causes** - Not symptoms
5. **Document as you go** - Capture learnings immediately

## Related Documentation
- [Architecture Overview](./architecture.md)
- [Work Patterns System](./work-patterns.md)
- [Unified Scheduler](./unified-scheduler.md)