# Development Best Practices

*Last Updated: 2025-09-02*

## What Makes a "Perfect" PR

Based on PR #43 which was described as "basically perfect", here are the key elements:

### 1. Comprehensive Test Coverage
- Write tests BEFORE implementation (TDD)
- Tests must FAIL initially to prove they're valid
- Cover all edge cases (with notes, without notes, multiple cycles)
- Use descriptive test names that explain the scenario

### 2. Zero Tolerance for Errors
- **TypeScript**: 0 errors required
- **ESLint**: 0 errors required (warnings in scripts/ are acceptable)
- **All Tests**: Must pass before pushing
- **No Regression**: Existing tests must continue passing

### 3. Proper Git Workflow
- **NEVER use `--no-verify`** to bypass pre-push hooks
- Atomic commits (one logical change per commit)
- Clear, descriptive commit messages
- Commit tests separately from implementation

### 4. Three-Layer Bug Fixing
When fixing bugs, always check:
1. **Store Layer**: Business logic in Zustand stores
2. **Database Layer**: Persistence operations  
3. **UI Layer**: Component connections and user interactions

Missing any layer can leave bugs partially fixed.

### 5. Mock Testing Patterns
For Vitest with hoisted mocks:
```typescript
// ✅ CORRECT - Define inline and export
vi.mock('./module', () => {
  const mockFn = vi.fn()
  return {
    getDatabase: () => ({ method: mockFn }),
    __mocks: { mockFn }  // Export for test access
  }
})

// ❌ WRONG - External variables undefined during hoisting
const mockFn = vi.fn()
vi.mock('./module', () => ({
  getDatabase: () => ({ method: mockFn }) // mockFn is undefined!
}))
```

### 6. Time Tracking Principles
- Work sessions END at current time and extend BACKWARD
- Calculate: `startTime = new Date(Date.now() - minutes * 60000)`
- Store in both WorkSession (history) and TaskStep (current state)

### 7. PR Description Structure
A good PR description includes:
- **Summary**: Brief overview of changes
- **Problems Fixed**: List each issue with details
- **Solutions**: Technical approach for each fix
- **Test Coverage**: List of tests added
- **Manual Testing Checklist**: Steps for reviewers to verify

### 8. Development Process
1. **Search First**: Look for existing implementations
2. **Read Tests**: Understand expected behavior
3. **Write New Tests**: Define your requirements
4. **Implement Minimally**: Just enough to pass tests
5. **Verify Quality**: Run full test suite
6. **Update Context**: Document learnings in `/context/`

## Common Pitfalls to Avoid

### 1. Skipping the Search Phase
- Always search for similar functionality before implementing
- Check existing patterns in the codebase
- Look for TODOs related to your task

### 2. Incomplete Testing
- Don't just test the happy path
- Test with missing data, empty states, edge cases
- Verify mock functions are actually called

### 3. Ignoring Async Patterns
- Database operations are async - handle them properly
- Make store methods async when they do DB operations
- Use proper error handling for all async code

### 4. Missing Documentation
- Update `/context/` files after significant work
- Document architectural decisions in `decisions.md`
- Record insights and patterns in `insights.md`
- Keep `state.md` current with session progress

### 5. UI-Only Fixes
- Don't just fix the visual issue
- Ensure data persistence is correct
- Verify state management is properly connected

## Quality Checklist

Before marking any task complete:

- [ ] `npm run typecheck` - 0 errors
- [ ] `npm run lint` - 0 errors  
- [ ] `npm test -- --run` - All pass
- [ ] `npm run build` - Successful
- [ ] Context files updated
- [ ] Commits are atomic with clear messages
- [ ] No `--no-verify` flag used
- [ ] PR description is comprehensive

## Testing Hierarchy

1. **Unit Tests**: Test individual functions/components
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test full user workflows (when available)
4. **Manual Testing**: Verify UI/UX feels right

## Logging-First Development (MANDATORY)

### All New Features Must Include Comprehensive Logging
**Before marking ANY feature complete:**
1. **Implement extensive logging** at all key decision points
2. **Test that logging actually appears** when using the feature
3. **Verify log messages are helpful** for debugging and understanding
4. **Use appropriate log levels**: debug for details, info for operations, warn for issues
5. **Only THEN mark feature as complete**

### Logging Requirements for Features
```typescript
// Feature initialization
logger.ui.info('🏗️ [FEATURE] Starting initialization', { inputParams, context })

// Key processing steps  
logger.ui.info('📋 [FEATURE] Processing data', { dataSize, options })

// Decision points and branches
logger.ui.debug('🔍 [FEATURE] Checking condition', { condition, result, impact })

// Problems or edge cases
logger.ui.warn('🚨 [FEATURE] Issue detected', { issue, severity, mitigation })

// Successful completion
logger.ui.info('✅ [FEATURE] Operation complete', { results, performance })
```

### Verification Protocol
1. Implement feature code
2. Add comprehensive logging throughout
3. Test feature manually and verify logs appear correctly
4. Check that logs provide enough detail for debugging
5. ONLY AFTER logging verified - mark feature complete

### Features Are Incomplete Without Working Logging
- Cannot debug issues without observable behavior
- Cannot verify feature works in production
- Cannot troubleshoot user problems
- Logging is not optional - it's a core requirement

## Code Review Readiness

Your code is ready for review when:
- All automated checks pass
- You've manually tested the changes
- **Comprehensive logging is implemented and verified working**
- Documentation is updated
- You can explain every change made
- You're confident in the solution

## PR Review Response Protocol

### Mandatory Steps When Addressing Review Feedback
1. **Retrieve all comments**: Use `gh pr view [PR#] --comments` or check GitHub UI
2. **Create a checklist** of all feedback items
3. **Address each item**:
   - Implement requested changes
   - OR explain why change wasn't made
   - OR ask for clarification if unclear
4. **Verify circular dependencies**: If reviewer mentions circular patterns, trace the full flow
5. **Test the actual user flow**: Don't just run unit tests, manually verify the fix works
6. **Document what was changed** in response to each comment

### Common Review Feedback Patterns
- **"This seems circular"**: You have a confusing dependency chain, simplify the flow
- **"Where is this defined?"**: Missing imports, unclear variable sources, or poor naming
- **"Why is this different?"**: Inconsistent patterns, should reuse existing code
- **Code duplication**: Extract to shared utilities or components
- **Unclear logic**: Add comments or refactor for clarity

### Example: Circular Dependency Pattern
When reviewer says "this seems circular":
```javascript
// ❌ BAD - Circular pattern
Component passes onChange to DependencyEditor
  → DependencyEditor calls onChange
  → onChange updates form
  → Form triggers re-render
  → Component passes new onChange to DependencyEditor
  → Creates confusion about data flow

// ✅ GOOD - Clear unidirectional flow
Component has local state
  → Passes state value to DependencyEditor
  → DependencyEditor calls onChange with new value
  → Component updates local state
  → Component updates form for submission
  → Clear data flow
```

## Performance Considerations

- Batch database operations when possible
- Use memoization for expensive calculations
- Implement lazy loading for heavy components
- Consider debouncing for user input handlers

## Security Principles

- Never commit secrets or API keys
- Validate all user input
- Use parameterized queries for database operations
- Follow principle of least privilege

## Maintenance Mindset

Write code as if the person maintaining it is:
- A violent psychopath who knows where you live
- Actually just you in 6 months who has forgotten everything
- Someone new to the codebase trying to fix a critical bug

Therefore:
- Use clear, descriptive names
- Comment the "why", not the "what"
- Follow existing patterns consistently
- Keep functions small and focused
- Make dependencies explicit