# Testing Strategy & Infrastructure Plan

## 🎯 Current Testing Gaps

### Critical Issues
1. **Amendment Applicator Bugs**: Creating duplicates, incorrect dependency wiring
2. **No UI Integration Tests**: Can't catch UI-specific regressions
3. **Limited E2E Coverage**: Missing real-world workflow testing
4. **Manual Testing Burden**: Too much reliance on manual verification

## 🚀 Proposed Testing Infrastructure

### 1. UI Integration Testing with Playwright

**Why Playwright over Puppeteer:**
- Better TypeScript support
- Built-in test runner
- Electron app support out of the box
- Auto-wait for elements
- Better debugging tools

**Implementation Plan:**
```typescript
// playwright.config.ts
export default {
  testDir: './e2e',
  use: {
    // Launch Electron app
    launchOptions: {
      executablePath: electronPath,
      args: [appPath]
    }
  }
}

// e2e/amendment-flow.test.ts
test('voice amendment creates correct updates', async ({ page }) => {
  // 1. Create a task
  await page.click('[data-testid="create-task"]')
  
  // 2. Record amendment
  await page.click('[data-testid="voice-amendment"]')
  
  // 3. Verify parsing
  const amendments = await page.locator('[data-testid="amendment-list"]')
  expect(amendments).toContainText('Mark as complete')
  
  // 4. Apply and verify
  await page.click('[data-testid="apply-amendments"]')
  await expect(page.locator('[data-testid="task-status"]')).toHaveText('Completed')
})
```

### 2. Claude-Driven Integration Tests

**Concept**: Use Claude to generate test scenarios based on user stories

**Architecture:**
```typescript
// test-generation/claude-test-builder.ts
interface TestScenario {
  userStory: string
  steps: TestStep[]
  expectedOutcome: string
}

async function generateTestFromStory(story: string): Promise<TestScenario> {
  const prompt = `
    Given this user story: "${story}"
    Generate a detailed test scenario with:
    1. Setup steps
    2. Action steps
    3. Verification steps
    4. Expected outcomes
  `
  
  return await claude.generateStructuredTest(prompt)
}

// Example usage
const story = "As a user, I want to update a workflow step's duration via voice"
const test = await generateTestFromStory(story)
// Generates complete test with setup, actions, and assertions
```

### 3. Amendment Parser Test Suite

**Comprehensive test coverage for amendment parsing:**

```typescript
// tests/amendment-parser-integration.test.ts
describe('Amendment Parser Integration', () => {
  const testCases = [
    {
      input: "Mark the code review as complete",
      expected: {
        type: AmendmentType.StatusUpdate,
        targetTask: "code review",
        newStatus: TaskStatus.Completed,
        confidence: 0.95
      }
    },
    {
      input: "Add a new step after testing for deployment",
      expected: {
        type: AmendmentType.StepAddition,
        afterStep: "testing",
        newStep: { name: "deployment" },
        confidence: 0.90
      }
    },
    {
      input: "Remove the documentation step",
      expected: {
        type: AmendmentType.StepRemoval,
        targetStep: "documentation",
        confidence: 0.95
      }
    }
  ]

  testCases.forEach(({ input, expected }) => {
    it(`should parse: "${input}"`, async () => {
      const result = await parseAmendment(input, mockContext)
      expect(result).toMatchObject(expected)
    })
  })
})
```

### 4. Database State Verification

**Test database state after operations:**

```typescript
// tests/database-state.test.ts
describe('Database State Consistency', () => {
  it('should not create duplicate tasks on amendment', async () => {
    // Setup
    const task = await db.createTask({ name: 'Original Task' })
    
    // Apply amendment
    await applyAmendment({
      type: AmendmentType.StatusUpdate,
      taskId: task.id,
      newStatus: TaskStatus.Completed
    })
    
    // Verify no duplicates
    const tasks = await db.getTasks({ name: 'Original Task' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe(TaskStatus.Completed)
  })

  it('should maintain dependency integrity', async () => {
    // Create workflow with dependencies
    const workflow = await createTestWorkflow()
    
    // Apply dependency change
    await applyAmendment({
      type: AmendmentType.DependencyChange,
      stepId: workflow.steps[1].id,
      newDependencies: [workflow.steps[2].id]
    })
    
    // Verify no orphans
    const graph = await buildDependencyGraph(workflow.id)
    expect(graph.orphanNodes).toHaveLength(0)
    expect(graph.cycles).toHaveLength(0)
  })
})
```

## 📋 Implementation Phases

### Phase 1: Critical Bug Fixes (Week 1)
1. Fix amendment applicator duplicate issue
2. Add basic integration tests for amendments
3. Add database state verification

### Phase 2: Playwright Setup (Week 2)
1. Install and configure Playwright for Electron
2. Create basic UI test harness
3. Write tests for critical user flows:
   - Task creation
   - Voice amendment
   - Schedule generation
   - Work logging

### Phase 3: Claude Test Generation (Week 3)
1. Build Claude test generator
2. Generate tests from user stories
3. Create test case library from feedback

### Phase 4: Continuous Testing (Ongoing)
1. Add tests for each bug fix
2. Generate tests for new features
3. Build regression test suite

## 🎯 Success Metrics

### Coverage Goals
- **Unit Tests**: 80% code coverage
- **Integration Tests**: All critical paths covered
- **E2E Tests**: Top 10 user workflows
- **Amendment Parser**: 100% of known patterns

### Quality Gates
- No PR merged without tests
- All tests must pass in CI
- New features require E2E tests
- Bug fixes require regression tests

## 🔧 Tooling Requirements

### Development Dependencies
```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.0.0",
    "vitest": "^1.0.0",
    "happy-dom": "^12.0.0",
    "msw": "^2.0.0"
  }
}
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

## 🚨 Priority Test Cases

### Amendment Applicator (CRITICAL)
1. ✅ Correct task updates without duplicates
2. ✅ Proper dependency wiring
3. ✅ No orphan nodes in graph
4. ✅ Workflow completion handled correctly
5. ✅ Step additions maintain order

### Schedule Generation
1. ✅ Sleep blocks respected
2. ✅ Meeting blocks not overwritten
3. ✅ Repetition patterns applied
4. ✅ No midnight boundary issues
5. ✅ Weekend handling correct

### Work Logger
1. ✅ Sessions don't overlap
2. ✅ Time calculations accurate
3. ✅ Dual-view synchronization
4. ✅ Drag-and-drop creates correct sessions

## 📚 Resources

### Documentation
- [Playwright Electron Guide](https://playwright.dev/docs/api/class-electron)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)

### Example Projects
- [Electron Playwright Example](https://github.com/microsoft/playwright/tree/main/examples/electron)
- [React Testing Patterns](https://github.com/testing-library/react-testing-library)

## 🎯 Next Steps

1. **Immediate**: Fix critical amendment applicator bug
2. **This Week**: Add integration tests for amendments
3. **Next Week**: Set up Playwright infrastructure
4. **Month Goal**: 80% test coverage with E2E suite

---
*Last Updated: 2025-08-29*