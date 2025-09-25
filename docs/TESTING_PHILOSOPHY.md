# Testing Philosophy: Beyond "Tests Pass"

## The PR #76 Testing Failure

"All tests pass" meant nothing when:
- Database methods only existed in mocks
- Optional chaining hid missing methods
- Test-only code paths were created
- Production failed despite green tests

This document defines our testing philosophy to ensure tests actually validate production behavior.

## Core Testing Principles

### 1. Test Production Reality, Not Test Reality

```typescript
// ❌ WRONG: Test-only implementation
test('updates task capacity', () => {
  mockPrisma.task.updateCapacity = jest.fn()  // This method doesn't exist!
  // Test passes but production fails
})

// ✅ RIGHT: Test actual implementation
test('updates task capacity', () => {
  const task = await prisma.task.update({
    where: { id: 'task-1' },
    data: { capacity: 100 }
  })
  expect(task.capacity).toBe(100)
})
```

### 2. Tests Must Fail First (TDD Red-Green-Refactor)

```bash
# The TDD Cycle
1. Write test → Run it → Must see RED (failure)
2. Write minimal code → Run test → Must see GREEN (pass)
3. Refactor → Run test → Must stay GREEN

# If test passes immediately, it's testing nothing!
```

### 3. Integration Over Isolation

```typescript
// ❌ WRONG: Over-mocked test
test('scheduler works', () => {
  mockScheduler.schedule = jest.fn(() => mockResult)
  // Not testing the actual scheduler!
})

// ✅ RIGHT: Test real integration
test('scheduler schedules tasks within work blocks', () => {
  const scheduler = new UnifiedScheduler()
  const result = scheduler.scheduleTasks(tasks, patterns)
  expect(result[0].startTime).toBeWithinWorkBlock()
})
```

## The Testing Pyramid (Modified)

```
                 ┌──────────────┐
                 │   E2E Tests  │  10%
                 │ (User flows) │  Slow but real
                 └──────┬───────┘
              ┌─────────┴─────────┐
              │ Integration Tests  │  50%
              │ (Feature behavior) │  Balance speed/reality
              └─────────┬─────────┘
         ┌───────────────┴───────────────┐
         │        Unit Tests            │  40%
         │    (Pure functions only)     │  Fast and focused
         └──────────────────────────────┘

Key Insight: More integration tests, fewer unit tests than traditional
```

## Test Categories and Their Purpose

### Unit Tests (Pure Functions Only)
**Purpose**: Test algorithmic correctness
**When to use**: Pure functions with no side effects
**Example**: Date calculations, priority sorting, capacity math

```typescript
test('calculates task priority correctly', () => {
  expect(calculatePriority(importance: 5, urgency: 3)).toBe(15)
})
```

### Integration Tests (Primary Testing Layer)
**Purpose**: Test feature behavior with real dependencies
**When to use**: Most application features
**Example**: Task creation, scheduling, database operations

```typescript
test('creates task and schedules it', async () => {
  // Real database, real scheduler
  const task = await taskService.createTask(data)
  const schedule = await scheduler.scheduleTasks([task], patterns)
  expect(schedule[0].startTime).toBeDefined()
})
```

### E2E Tests (Critical User Paths)
**Purpose**: Validate complete user workflows
**When to use**: Critical business flows only
**Example**: Complete task lifecycle, session management

```typescript
test('user can create and complete task', async () => {
  await page.click('[data-testid="create-task"]')
  await page.fill('[name="title"]', 'Test Task')
  await page.click('[type="submit"]')
  await expect(page.locator('text=Test Task')).toBeVisible()
})
```

### Production Bug Replication Tests
**Purpose**: Prevent regression of fixed bugs
**When to use**: After every production bug
**Example**: Exact scenario from user report

```typescript
test('PR #76: handles missing capacity field', async () => {
  // Exact scenario that broke in production
  const workBlock = { startTime: '09:00', endTime: '17:00' }
  // No capacity field!
  const result = scheduler.getBlockCapacity(workBlock)
  expect(result).toBeDefined()  // Should handle gracefully
})
```

## Testing Anti-Patterns to Avoid

### 1. The Mock Everything Pattern
```typescript
// ❌ WRONG
jest.mock('../entire-module')
jest.mock('../another-module')
jest.mock('../and-another')
// You're not testing your code anymore!
```

### 2. The Optional Chaining Hack
```typescript
// ❌ WRONG
const result = service?.method?.() ?? defaultValue
// Hides that method doesn't exist in production
```

### 3. The Test-Only Code Path
```typescript
// ❌ WRONG
if (process.env.NODE_ENV === 'test') {
  return mockData  // Production never runs this!
}
```

### 4. The Snapshot Overuse
```typescript
// ❌ WRONG
expect(everything).toMatchSnapshot()
// Changes become "update snapshot" without thought
```

### 5. The Implementation Test
```typescript
// ❌ WRONG
expect(spy).toHaveBeenCalledWith(exactImplementationDetails)
// Tests HOW not WHAT, breaks with refactoring
```

## Testing Strategies by Feature

### Database Operations
```typescript
// Use real database with transaction rollback
describe('Task Operations', () => {
  beforeEach(async () => {
    await prisma.$transaction.start()
  })
  
  afterEach(async () => {
    await prisma.$transaction.rollback()
  })
  
  test('creates task with all fields', async () => {
    // Test with real database
  })
})
```

### Scheduler Testing
```typescript
// Test with realistic scenarios
test('handles edge cases', () => {
  const edgeCases = [
    { tasks: [], patterns: [] },  // Empty
    { tasks: [hugeTask], patterns: [tinyBlock] },  // Overflow
    { tasks: [pastTask], patterns: [todayPattern] },  // Time issues
  ]
  
  edgeCases.forEach(scenario => {
    expect(() => scheduler.schedule(scenario)).not.toThrow()
  })
})
```

### UI Component Testing
```typescript
// Test behavior, not implementation
test('task creation flow', async () => {
  render(<CreateTaskModal />)
  
  // User behavior
  await userEvent.type(screen.getByLabelText('Title'), 'New Task')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  
  // Outcome
  expect(onTaskCreated).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'New Task' })
  )
})
```

### IPC Communication
```typescript
// Test both directions
test('IPC round trip', async () => {
  // Renderer → Main
  const result = await ipcRenderer.invoke('task:create', data)
  expect(result.id).toBeDefined()
  
  // Main → Renderer
  ipcMain.emit('task:updated', updatedTask)
  await waitFor(() => {
    expect(store.getTask(task.id)).toEqual(updatedTask)
  })
})
```

## Test Quality Metrics

### Coverage is Not Quality
```
🟢 Line Coverage: 80%  ← Can still have bugs!
🔴 Test Quality: Low   ← Mocked everything

Better Metrics:
- Mutation Score: Can your tests detect code changes?
- Bug Escape Rate: Bugs found in production vs testing
- Test Stability: How often do tests flake?
- Test Speed: Can you run them frequently?
```

### The Real Test Quality Questions
1. **If I delete this line, will a test fail?**
2. **If I change this logic, will a test catch it?**
3. **Do tests give me confidence to refactor?**
4. **Can I understand what broke from test output?**
5. **Do tests document intended behavior?**

## Writing Effective Test Cases

### The AAA Pattern
```typescript
test('clear test structure', () => {
  // Arrange - Set up test data
  const task = createTestTask({ duration: 60 })
  const pattern = createTestPattern({ capacity: 120 })
  
  // Act - Perform the action
  const result = scheduler.scheduleTask(task, pattern)
  
  // Assert - Check the outcome
  expect(result.startTime).toBeDefined()
  expect(result.duration).toBe(60)
})
```

### Descriptive Test Names
```typescript
// ❌ BAD
test('test1', () => {})
test('works', () => {})
test('scheduler', () => {})

// ✅ GOOD
test('schedules task within available work block', () => {})
test('throws error when task exceeds all block capacities', () => {})
test('preserves task order when scheduling multiple tasks', () => {})
```

### Test Data Builders
```typescript
// Create realistic test data easily
const createTestTask = (overrides = {}) => ({
  id: `task-${Date.now()}`,
  title: 'Test Task',
  duration: 60,
  importance: 5,
  urgency: 5,
  type: TaskType.Focused,
  ...overrides
})

// Usage
const urgentTask = createTestTask({ urgency: 10 })
const longTask = createTestTask({ duration: 240 })
```

## Test Maintenance

### When to Update Tests
- ✅ **Behavior changes**: Update tests to match new behavior
- ✅ **Bug fixes**: Add test for the bug scenario
- ✅ **Refactoring**: Tests should still pass unchanged
- ❌ **Implementation details change**: Tests shouldn't care

### When to Delete Tests
- Feature is removed
- Test is redundant (covered elsewhere)
- Test is constantly flaking
- Test tests implementation, not behavior

### Test Refactoring
```typescript
// Before: Duplicate setup
test('test 1', () => {
  const task = { id: '1', title: 'Task', duration: 60, ... }
  // test code
})

test('test 2', () => {
  const task = { id: '1', title: 'Task', duration: 60, ... }
  // test code
})

// After: Shared setup
describe('Task Scheduling', () => {
  let task: Task
  
  beforeEach(() => {
    task = createTestTask()
  })
  
  test('test 1', () => { /* use task */ })
  test('test 2', () => { /* use task */ })
})
```

## Testing in CI/CD

### Test Stages
```yaml
# Run in parallel for speed
stage: test
  parallel:
    - unit-tests:      # Fast, run first
        script: npm run test:unit
    - integration-tests:  # Slower, but critical
        script: npm run test:integration
    - lint-and-type:   # Static analysis
        script: npm run lint && npm run typecheck

# Run after parallel tests pass
stage: e2e
  script: npm run test:e2e
  # Only on main branch or PRs
```

### Flaky Test Management
```typescript
// Mark flaky tests explicitly
test.skip('flaky: dependent on system time', () => {
  // TODO: Fix timezone dependency
  // Tracked in TECH_DEBT.md#timezone-tests
})

// Better: Fix the flakiness
test('timezone independent', () => {
  const fixedTime = new Date('2024-01-15T10:00:00Z')
  jest.setSystemTime(fixedTime)
  // Now test is deterministic
})
```

## Testing Philosophy Checklist

### Before Writing Tests
- [ ] Is this testing behavior or implementation?
- [ ] Will this test catch real bugs?
- [ ] Can I make this test fail first?
- [ ] Am I testing at the right level?
- [ ] Is this test documenting intent?

### While Writing Tests
- [ ] Is the test name descriptive?
- [ ] Is the test independent?
- [ ] Is the test deterministic?
- [ ] Is the test fast enough?
- [ ] Is the test readable?

### After Writing Tests
- [ ] Did the test fail first (red)?
- [ ] Does the test pass now (green)?
- [ ] Can I break the code and see test fail?
- [ ] Is the test maintainable?
- [ ] Does CI run this test?

## The Golden Rules

1. **A test that never failed has no value**
2. **Test behavior, not implementation**
3. **If you can't test it, you can't trust it**
4. **Fast tests get run, slow tests get skipped**
5. **A flaky test is worse than no test**
6. **Test names are documentation**
7. **Production bugs deserve regression tests**
8. **Mocks are a necessary evil, use sparingly**
9. **Integration tests find real bugs**
10. **Delete tests that don't provide value**

## Testing Maturity Levels

### Level 1: No Tests 🔴
- Debugging in production
- Fear of changes
- Frequent regressions

### Level 2: Some Tests 🟠
- Basic happy path coverage
- Many mocks
- Tests often out of date

### Level 3: Good Coverage 🟡
- Most features tested
- Mix of unit and integration
- Tests run in CI

### Level 4: Test-Driven 🟢
- Tests written first
- High confidence in changes
- Tests as documentation

### Level 5: Production-Like Testing 🎆
- Tests mirror production
- Minimal mocking
- Catch issues before users
- Tests drive architecture

## Remember

> Tests are not about achieving coverage metrics.
> Tests are about **confidence to change code without breaking things**.
>
> If your tests don't give you that confidence, they're not doing their job.
> 
> The goal is not to have tests. The goal is to have **trustworthy software**.

---

*"Code without tests is broken by design." - Jacob Kaplan-Moss*

*"Legacy code is code without tests." - Michael Feathers*

*"Tests that never fail are testing nothing." - PR #76 Retrospective*