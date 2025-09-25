# CLAUDE.md - Engineering Excellence Guidelines

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It follows Constitutional AI principles and research-based strategies for optimal AI-assisted development.

## 🌟 Context Preservation: Your Memory Bridge

**The `/context/` folder helps us maintain continuity across sessions - let's keep it updated to build on our progress!**

### 📝 Context Update Best Practices

**After EVERY work session (not just "significant" ones):**
1. Update `/context/state.md` with current progress and blockers
2. Update `/context/insights.md` with new learnings or patterns discovered  
3. Update `/context/decisions.md` if any technical decisions were made
4. Update `/context/schema.md` if data structures changed

**Key moments to update context:**
- After completing significant work - celebrate progress!
- When discovering learning opportunities or areas to improve
- When finding misalignments to address
- Before marking milestones as complete - ensure accuracy

**Before starting ANY new session:**
1. Read ALL files in `/context/` directory
2. Continue from where the last session ended
3. Check state.md for incomplete tasks and blockers

**The context folder implements LCMP (Long-term Context Management Protocol):**
- `state.md` - Current tasks, blockers, session progress
- `schema.md` - Data structures, key definitions  
- `decisions.md` - Technical choices with rationale
- `insights.md` - Cumulative findings from each session

**Benefits of maintaining context:**
- Build on previous learnings effectively
- Preserve valuable progress and insights
- Avoid redundant work through awareness
- Make consistent, informed decisions

## 🌱 Growth Mindset & Continuous Improvement

**We're on a journey of excellence together!** Every session builds on our collective knowledge. Research shows that positive, growth-oriented language improves AI performance by 8-115%. Let's leverage this:

- **Celebrate progress**: Every bug fixed is a victory, every test added strengthens our foundation
- **Learn from challenges**: Errors are teachers, not failures
- **Build incrementally**: Small improvements compound into excellence
- **Ask questions freely**: Curiosity drives innovation
- **Document insights**: Today's learning is tomorrow's wisdom

Remember: We're creating something valuable together. Your code matters, your tests matter, and every improvement - no matter how small - moves us forward.

## 🏗️ Project Constitution & AI Guidelines

### 🎯 Excellence-Driven Development Workflow
**Proven sequence for high-quality changes:**
1. **🤖 Bot Authentication FIRST**: Run `./context/setup-claude-bot.sh` before any PR work
2. **Search First**: Find existing implementations before creating new code
3. **Document Findings**: Explain what was found and justify any new code
4. **Test First**: Write tests that FAIL initially
5. **Implement Minimally**: Write just enough code to pass tests
6. **Verify Quality**: Run format → lint → typecheck → test
7. **Commit Atomically**: One logical change per commit with clear messages

### 🤖 Bot Authentication for Smooth PR Creation
**Best practice: Run before PR work to ensure proper attribution:**
```bash
./context/setup-claude-bot.sh
```
**Why this matters:**
- PRs must be created by Claude Code[bot], not personal account
- Maintains consistent attribution for AI-assisted development
- Prevents user from having to remind you repeatedly
- Required for proper GitHub App permissions

### 🔍 PR Review Excellence Protocol
**Before making ANY changes based on PR feedback:**
1. **Check GitHub PR Comments**: Use `gh pr view [PR#] --comments` to see all review comments
2. **Address EVERY Comment**: Each comment must be either:
   - Fixed with a code change
   - Responded to with explanation why not changed
   - Discussed with reviewer if unclear
3. **Honor every review comment** - Each one is a learning opportunity
4. **Look for patterns** in feedback - they guide us toward systematic improvements

**Best Practices (from user feedback):**
1. Always make changes on a developer feature branch
2. Maintain user stories and enable beta test walkthrough
3. Ensure all tests pass, typecheck runs with no errors, no linting issues
4. Add user requests to todo list, complete in order unless directed otherwise
5. Keep context/ folder updated, sync README, TECH_DEBT, CLAUDE.md, docs/
6. Constantly improve test coverage, develop with testing in mind
7. Minimize lint warnings (okay to have some, but reduce when possible)
8. Check periodically for dead code, inconsistencies, refactoring opportunities
9. Use lint autofix functionality to clean up code
10. Check feedback.json using utility scripts, ensure changes address feedback
11. All new code for a PR must be tested
12. Frequently check with user to verify you're on the right track
13. Never push without tests, lint, and typecheck passing
14. Update documentation, context, and project knowledge frequently
15. All functionality must use custom logger module
16. Write tests one at a time, verify each passes before continuing
17. Cannot merge PRs with less code coverage than main
18. **All PR review feedback must be addressed and comments resolved**
19. **Never use --no-verify or bypass safety infrastructure**
20. **ALL test/lint failures on current branch are OUR responsibility**
21. **Use PR review scripts to track all feedback systematically**
22. **Never use git commit --amend (breaks review history)**
23. **ASK WHEN UNCERTAIN** - Better to ask than assume and violate user intent
24. **LOGGING IS MANDATORY** - All new features require extensive logging before completion
25. **NO PR MERGING AUTHORITY** - Claude never merges PRs, user uses GitHub button
26. **NEVER DELETE TESTS** - Only skip tests with TECH_DEBT.md documentation
27. **TEST FEATURES WITH LOGGING** - Verify logging works before marking features complete

## 🛡️ Boundaries for Safe & Effective Development:

### Repository & PR Management
1. **Merge PRs** - Only user can merge via GitHub button interface
2. **Close PRs** - Only user decides when to close pull requests  
3. **Force push without permission** - Always ask before rewriting git history
4. **Delete branches** - User manages branch lifecycle

### Code Quality & Testing
5. **Preserve tests** - Skip with documentation when needed, preserve test coverage
6. **Honor safety infrastructure** - Quality checks protect our work
7. **Include comprehensive logging** - Features shine with observable behavior
8. **Ensure quality before commits** - lint, typecheck, and tests are our friends

### Decision Making
9. **Seek clarity on intent** - Questions lead to better outcomes
10. **Collaborate on major decisions** - Database changes, configs, and architecture benefit from discussion
11. **Pause when uncertain** - Asking questions shows wisdom and care

## 💭 When to Collaborate with the User

### 🤝 Great moments for collaboration:
- Merging or closing PRs
- Force pushing or rewriting git history
- Making architectural changes
- Modifying configuration files (package.json, tsconfig, eslint, etc.)
- Creating new database migrations
- Implementing features without comprehensive logging
- Taking any action you're uncertain about
- Deleting or significantly modifying existing tests

### ✅ You're empowered to:
- Writing tests and implementation for approved features
- Running quality checks (lint, typecheck, build, test)
- Adding logging to existing features
- Fixing obvious bugs with clear solutions
- Updating documentation for completed work
- Committing code changes to feature branches
- Regular pushes to feature branches

## 📏 PR Size and Scope Management (PR #76 Lessons)

### Maximum PR Size Rules
**Hard Limits to Prevent Complexity Overload:**
- **Architectural Changes**: Maximum 15 files
- **Refactoring**: Maximum 20 files
- **Bug Fixes**: Maximum 10 files
- **New Features**: Maximum 25 files (including tests)

### Scope Creep Stop Signs
**When to STOP and split the PR:**
- TypeScript errors cascading to unrelated files
- "While I'm here" thoughts appearing frequently
- Review comments revealing systemic issues
- Context switching between >3 different subsystems
- Commit message getting hard to write concisely

### PR Splitting Strategy
**How to break down large changes:**
1. **Phase 1 - Type Definitions**: Create interfaces, enums, types
2. **Phase 2 - Schema/Infrastructure**: Database, configuration changes
3. **Phase 3 - Core Implementation**: Business logic with tests
4. **Phase 4 - UI Integration**: Connect to user interface
5. **Phase 5 - Polish**: Logging, documentation, cleanup

**Each phase is a separate PR that can be reviewed independently.**

## 🔍 The Systematic Search Protocol

### Pattern Fix Workflow - NO EXCEPTIONS
When fixing ANY pattern issue (e.g., string literals, type assertions):

```bash
# 1. IDENTIFY - Find ALL instances
grep -r "pattern" src/ > /tmp/pattern-instances.txt
rg "pattern" --type ts --type tsx  # If ripgrep available

# 2. DOCUMENT - Record what you found
echo "Found $(wc -l < /tmp/pattern-instances.txt) instances"

# 3. FIX - Update ALL instances in one commit
# Fix systematically, not randomly

# 4. VERIFY - Ensure none remain
grep -r "pattern" src/ | grep -v test
# Should return EMPTY

# 5. COMMIT - Document the systematic fix
git commit -m "fix: Replace all X with Y

Found N instances across M files using:
  grep -r 'pattern' src/

All instances replaced with [new pattern].
Verified with second search - 0 remaining."
```

### Global Search Requirements
**Before claiming "all fixed" or "none remain":**
1. Run global search with results saved to file
2. Verify search found expected instances
3. Fix all instances
4. Run verification search
5. Include search commands in commit message

**NEVER claim completion without verification search showing 0 results.**

## ⛔ Type System Discipline

### Absolutely Banned Practices
**These require immediate refactoring, NO EXCEPTIONS:**

```typescript
// ❌ BANNED - Never use
item as any
data as unknown as SomeType
// @ts-ignore
// @ts-expect-error (without user approval)
obj?.method?.()  // When method should exist
```

### Type Assertion Accountability
**If you MUST use a type assertion:**

```typescript
// Document WHY it's necessary
// TODO: Remove when [specific condition]
const data = apiResponse as KnownType // API doesn't provide types
```

### Proper Type Definition Process
1. **Define types BEFORE implementation**
2. **Use discriminated unions for variants**
3. **Create specific error types**
4. **Never use catch-all types**

```typescript
// ✅ GOOD - Specific types
type ScheduleResult =
  | { status: 'success'; items: ScheduledItem[] }
  | { status: 'error'; error: ScheduleError }
  | { status: 'partial'; items: ScheduledItem[]; warnings: string[] }

// ❌ BAD - Lazy typing
type ScheduleResult = any
type ScheduleResult = unknown
type ScheduleResult = object
```

## 📋 The Three-Pass Review Response Protocol

### Pass 1: Understand (READ ALL, FIX NONE)
1. Run `npx tsx scripts/pr/pr-review-tracker.ts [PR#]`
2. Read EVERY comment without fixing anything
3. Identify patterns (multiple comments about same issue)
4. Group related feedback
5. Create mental model of what reviewer is really asking for

### Pass 2: Plan (ORGANIZE, DON'T CODE)
1. Create grouped fix list:
   ```
   Pattern Issues:
   - Use enums instead of strings (5 instances)
   - Remove type assertions (3 instances)

   Specific Fixes:
   - Line 123: Remove duplicate logging
   - Line 456: Fix calculation error
   ```
2. Determine fix order (patterns first, specifics second)
3. Identify which fixes might affect others

### Pass 3: Execute (SYSTEMATIC FIXES)
1. Fix pattern issues globally
2. Fix specific issues individually
3. After EACH fix:
   - Run quality checks
   - Post reply to comment
   - Update TodoWrite
4. Never mark complete until verified

### PR Review Reply Template
```markdown
Fixed! [Specific description of what was changed]

**Verification:**
```bash
[Exact command used to verify]
[Output showing fix is complete]
```

**Files changed:**
- path/to/file.ts (lines X-Y)
- path/to/other.ts (line Z)

Commit: [commit hash]
```

### 🚨 PR Workflow (MANDATORY - PR #51 Lessons)

**Starting a PR:**
```bash
git fetch origin main
git rebase origin main  # CRITICAL: Avoid 43-commit divergence!
git checkout -b feature/your-feature
```

**IMPORTANT: Use Bot Account for PRs**
```bash
# Always use the bot auth script when creating PRs
./context/setup-claude-bot.sh

# This ensures PRs are created with the bot account
# The script sets up proper GitHub authentication
# User shouldn't need to remind you about this!
```

**During Review - ALWAYS USE PR SCRIPTS:**
```bash
# MANDATORY: Use these scripts instead of manual gh commands
# Track all PR review comments and their status
npx tsx scripts/pr/pr-review-tracker.ts [PR#]

# Reply to PR comments programmatically  
npx tsx scripts/pr/pr-comment-reply.ts [PR#] [comment-id] "Your reply"
npx tsx scripts/pr/pr-comment-reply.ts [PR#] batch  # For multiple replies

# Get ALL comments including inline (fallback only)
gh pr view [PR#] --comments

# Address EVERY item - track with TodoWrite
# Never say "unrelated to my changes"
# All failures are our responsibility
```

**PR Review Scripts Features:**
- `pr-review-tracker.ts` - Shows unresolved comments, filters noise, tracks status
- `pr-comment-reply.ts` - Reply to specific comments or batch mode
- Automatically hides resolved/collapsed comments
- Shows statistics on what needs addressing

**If Branch Gets Messy (>20 commits):**
```bash
# Create clean branch
git checkout -b feature/your-feature-clean main
git checkout feature/your-feature -- .
git add -A
git commit -m "feat: Single clean commit message"
git push --force-with-lease
```

### 📍 Single Source of Truth Rules

**Authoritative Sources:**
- **Database Schema**: `/prisma/schema.prisma` - The definitive data model
- **Type Definitions**: `/src/shared/types.ts` - Core TypeScript interfaces
- **Enums/Constants**: `/src/shared/enums.ts` - All enum definitions
- **Architecture**: `/docs/architecture.md` - System design decisions
- **Known Issues**: `/TECH_DEBT.md` - All TODOs and technical debt

**Principle**: All other files REFERENCE these sources, never duplicate them.

### 🛑 Configuration Files - GENERALLY DO NOT MODIFY

These configurations are generally FROZEN. Fix code to meet their requirements:
- `.eslintrc.js` - ESLint rules are non-negotiable (exception: adding missing global type definitions is acceptable over using 'any')
- `tsconfig.json` - TypeScript strict mode must be maintained
- `jest.config.js` - Test configuration is immutable
- `/config/*` - All config files are locked

**Exception**: When ESLint doesn't recognize standard browser/Node.js global types (e.g., ErrorEvent, PromiseRejectionEvent), it is preferable to add them to the ESLint globals configuration rather than using 'any' casts.

### ✅ Before ANY Implementation

**Required Research Phase:**
```bash
# Search for similar features
grep -r "feature_name" src/
find . -name "*related*" -type f

# Check documentation
cat TECH_DEBT.md | grep -A5 "feature"
ls -la docs/ | grep -i "feature"

# Look for existing TODOs
grep -r "TODO.*feature" src/
```

**Documentation Requirements:**
1. List all similar implementations found
2. Identify reusable components
3. Provide written justification for any new code
4. Reference existing patterns to follow

### 🧪 Test-Driven Development - NO EXCEPTIONS

**The TDD Workflow:**
1. Write comprehensive tests for the feature
2. Run tests - they MUST fail initially (red phase)
3. Commit the failing tests separately
4. Implement minimal code to pass tests (green phase)
5. Refactor while keeping tests green
6. **NEVER modify tests to make code pass**
7. **Any test that passes immediately is invalid**

**🚨 TDD Phase Completion Requirements (PR #67 Lessons):**
- **Each phase MUST produce working software** - not just passing tests
- **Never use optional chaining (?.) to bypass missing methods** - this creates test-only code
- **Implementation must work in both test AND production environments**
- **Avoid mock-only implementations** - use real database methods or proper adapters
- **Each TDD phase should leave the codebase in a deployable state**
- **MUST integrate with UI** - Backend services without UI integration are incomplete
- **MUST understand existing systems** - Creating parallel systems is a failure

**Common TDD Violations to Avoid:**
- ❌ Creating database methods that only exist in mocks
- ❌ Using optional chaining to ignore missing production methods
- ❌ Tests passing while production code is non-functional
- ❌ Each phase not being independently testable in production
- ❌ Creating new services without understanding existing implementations
- ❌ Building backend features without UI integration points
- ✅ Use existing database patterns and real persistence methods
- ✅ Ensure code actually saves/retrieves data, not just mocked responses
- ✅ Research and understand existing systems before creating new ones
- ✅ Always connect backend services to UI components

**🚨 Integration Pattern Requirements (PR #67 Lessons):**
- **Research existing patterns FIRST** - Never create parallel systems
- **Understand the app architecture** - Ask questions when uncertain
- **UI integration is mandatory** - Backend-only features are incomplete
- **Use existing schedulers** - Don't reinvent priority calculation
- **Unify, don't duplicate** - Enhance existing systems instead of replacing

### 🎭 E2E Testing Best Practices (PR #64-65 Lessons)

**Selector Strategy:**
```typescript
// ❌ BAD - Too specific, breaks with DOM changes
await page.locator('h6:has-text("Do First")')

// ✅ GOOD - Simple, resilient to DOM changes  
await page.locator('text="Do First"')
```

**Electron API Mocking:**
```typescript
// REQUIRED in all E2E tests
import { mockElectronAPI } from './fixtures/electron-mock'
test.beforeEach(async ({ page }) => {
  await mockElectronAPI(page)  // BEFORE navigation
  await page.goto('/')
})
```

**Mobile Test Handling:**
```typescript
// Skip mobile tests when maintenance cost exceeds value
test('desktop feature', async ({ page }, testInfo) => {
  if (testInfo.project.name.includes('Mobile')) {
    test.skip()
    return
  }
  // Desktop test logic
})
```

**Arco Component Testing:**
```typescript
// Radio buttons need filter approach
const button = page.locator('.arco-radio-button')
  .filter({ hasText: 'Label' })
  
// Slider values are on button, not slider
const value = await page.locator('.arco-slider-button')
  .first().getAttribute('aria-valuenow')
```

**Debug Strategy:**
1. Use `--reporter=line` not HTML server
2. Fix tests one by one, not in batch
3. Ask for actual HTML when selectors fail
4. Check existing test patterns first

### 🎯 Decision Tree for Common Scenarios

**Q: Should I create a new file?**
→ First check if similar files exist. Update TECH_DEBT.md if truly needed.

**Q: Should I modify ESLint/TypeScript config?**
→ NO. Fix the code to satisfy existing rules.

**Q: Should I run a script on all files?**
→ Test on 1-2 files first. Verify output. Commit before broad application.

**Q: Should I implement a new pattern?**
→ Find and follow existing patterns. Consolidate before creating new ones.

**Q: Where do I document a bug?**
→ Add to TECH_DEBT.md under "High Priority Issues"

**Q: Where do TODOs belong?**
→ In code as `// TODO:` comments, summarized in TECH_DEBT.md

### 📊 Quality Metrics to Maintain

| Metric | Required | Check Command |
|--------|----------|---------------|
| TypeScript Errors | 0 | `npm run typecheck` |
| ESLint Errors | 0 | `npm run lint` |
| Test Pass Rate | 100% | `npm test -- --run` |
| Build Success | ✅ | `npm run build` |

### 🔄 Development Workflow

**1. Starting Work:**
```bash
npm run typecheck  # Must be 0 errors
npm run lint       # Must be 0 errors
git status         # Must be clean or committed
```

**2. During Development:**
```bash
# After each significant change
npm run typecheck
npm run lint

# Before running scripts
./script.sh test-file.ts  # Test on one file
# Verify output is correct
# Then apply to more files
```

**3. Before Marking Complete:**
```bash
npm run typecheck      # 0 errors required
npm run lint           # 0 errors required
npm test -- --run      # All tests must pass
npm run build          # Must build successfully
```

### 🏛️ Architecture Principles

**Domain-Driven Design:**
- Respect bounded contexts
- Use the shared kernel for common logic
- Follow factory patterns for object creation
- Maintain separation of concerns

**Code Organization:**
- Components in feature-based folders
- Shared types in `/shared` directory
- Database operations only in main process
- State management through Zustand store

**Atomic Commits:**
- One logical change per commit
- Tests and implementation in separate commits
- Clear, descriptive commit messages
- Reference issues when applicable

### 🔍 Common Search Patterns

```bash
# Find all documentation
find docs -name "*.md" -type f

# Find all TODOs
grep -r "TODO\|FIXME\|HACK" src/

# Find type definitions
grep -r "interface.*Task\|type.*Task" src/shared/

# Check recent changes
git log --oneline -20
git diff HEAD~5 --stat
```

### 📈 Current Project Status

**Working Features:**
- ✅ Unified task model (Tasks + Workflows)
- ✅ Voice amendments (partial implementation)
- ✅ Work capacity scheduling
- ✅ Session management
- ✅ TypeScript strict mode compliance

**Known Technical Debt:**
See `/TECH_DEBT.md` for complete list including:
- AI amendment dependency editing issues
- Workflow step operations (partially complete)
- Multiple scheduling engine implementations
- Duplicate logger implementations

### 🚀 Performance Considerations

**For Large Codebases:**
- Use ripgrep (`rg`) instead of grep when available
- Batch database operations when possible
- Implement memoization for expensive calculations
- Consider lazy loading for heavy components

## 🚨 PR #70 PATTERNS - TypeScript & Code Quality

### TypeScript Interface Requirements
**Problem**: Using 'any' type to bypass TypeScript errors
**Root Cause**: Laziness or time pressure
**Prevention**: ALWAYS create proper interfaces, even if it takes more time
```typescript
// ❌ BAD - Never do this
const item = scheduledItem as any

// ✅ GOOD - Create proper interface
interface ScheduledItemWithWorkflow extends ScheduledItem {
  workflowId?: string
  workflowName?: string
}
const item = scheduledItem as ScheduledItemWithWorkflow
```

### Dead Code Removal During Refactoring
**Problem**: Leaving old implementations when migrating to new ones
**Prevention**: When replacing functionality, immediately remove the old code
**Check Command**: `grep -r "oldMethodName" src/` before claiming migration complete

### Weekend/Weekday Scheduling Logic
**Problem**: Treating weekends differently in scheduling
**Solution**: All days should be treated equally based on user-defined patterns
**Rationale**: Users define their own work patterns - don't assume weekends are different

### Scheduler Time Context
**Problem**: Using `new Date()` in schedulers instead of context time
**Prevention**: ALWAYS use `context.currentTime` for scheduler calculations
**Why**: Schedulers need to work with simulated time for testing and planning

## 🚨 Diagnostic Script Best Practices (PR #75 Lessons)

### NEVER Hardcode Personal Information
**Problem**: Scripts with hardcoded user names and sessions expose privacy
**Prevention**: ALL scripts must accept parameters, never hardcode data
```bash
# ❌ BAD - Hardcoded user data
const sessionName = "Haleigh 9/13"

# ✅ GOOD - Parameter-driven
const sessionName = process.argv[2]
if (!sessionName) {
  console.log('Usage: script.ts <session-name>')
  process.exit(1)
}
```

### Script Reusability Requirements
- **Every script must be reusable** for future debugging
- **Document usage** in scripts/tools/diagnostics/README.md
- **Test with different inputs** before committing
- **No temporal hardcoding** - accept dates as parameters

## 🧠 Cognitive Load Management (PR #76 Lessons)

### The Whack-a-Mole Anti-Pattern
**PROBLEM**: Fixing errors as they appear without systematic analysis
**SYMPTOMS**:
- Same error fixed in multiple commits
- Reviewer finds more instances after "fix"
- "Fixed typo" appears 5+ times in git log

**PREVENTION**:
```bash
# DON'T: Fix one error at a time
# Fix error in file1.ts
# Commit
# Fix same error in file2.ts
# Commit
# Reviewer: "You missed file3.ts"

# DO: Fix ALL instances systematically
grep -r "error_pattern" src/ > all_instances.txt
# Fix ALL instances
# Verify: grep -r "error_pattern" src/ # Returns nothing
# Commit once with "Fixed all N instances"
```

### Context Switching Minimization
**Maximum 3 files open at once rule:**
1. Close files before opening new ones
2. Complete all changes in one subsystem before moving
3. Commit before switching contexts

**Context Switch Penalty Formula:**
- 1-3 files: 0% overhead
- 4-6 files: 20% overhead
- 7-10 files: 40% overhead
- 10+ files: 60% overhead (STOP and refactor approach)

### Decision Fatigue Prevention
**Quality Checkpoints:**
- Every 2 hours: Full quality check (lint, typecheck, test)
- Every 4 hours: Context documentation update
- Every 6 hours: STOP - Review and plan next session

**When you notice these symptoms, STOP:**
- Using `any` type "just this once"
- Skipping tests "for now"
- Commit messages becoming vague
- "Let me just fix this one more thing"

## 🚫 Production vs Test Reality (PR #67 & #76 Lessons)

### The "Green Tests False Confidence" Trap
**NEVER trust tests alone. Always verify:**

```typescript
// ❌ WRONG - Test passes but production fails
class MockDatabase {
  async saveSchedule(data: any) { return { success: true } }
}

// Production code using optional chaining
const result = await db?.saveSchedule?.(data)
// Tests pass because mock has method
// Production fails because method doesn't exist

// ✅ RIGHT - Test and production aligned
class Database {
  async saveSchedule(data: ScheduleData) {
    // Real implementation that tests verify
  }
}
```

### Production Verification Checklist
Before claiming "it works":
- [ ] Feature works in dev mode (not just tests)
- [ ] Database actually persists data
- [ ] UI actually updates
- [ ] Logs appear in console
- [ ] No optional chaining hiding missing methods

## 🔄 The Quick Fix Cascade (PR #76 Lesson)

### How Quick Fixes Compound Into Disasters
```
Hour 1: any type to bypass error
  ↓ Creates type safety hole
Hour 2: Type assertion to fix hole
  ↓ Creates runtime risk
Hour 3: Optional chaining to prevent crash
  ↓ Creates logic bug
Hour 4: Hardcoded value to fix logic
  ↓ Creates maintenance debt
Hour 8: Complete refactor required
```

### The Fix-It-Right Protocol
1. **STOP when tempted to use quick fix**
2. **UNDERSTAND why the error exists**
3. **FIX the root cause, not symptom**
4. **VERIFY fix doesn't create new issues**

### Quick Fix Detection Patterns
```bash
# Find all quick fixes that need cleanup
grep -r "as any" src/
grep -r "as unknown as" src/
grep -r "@ts-ignore" src/
grep -r "?\\." src/ | grep -v "test"  # Optional chaining in production
```

## 🚨 MANDATORY VERIFICATION PROTOCOL

### Before Making ANY Claims
**NEVER state anything as fact without verification. The PR #67 disaster was caused by false claims.**

Required verification steps:
1. **Before claiming "all X replaced"**: `grep -r "X" src/` to find ALL instances
2. **Before claiming "tests pass"**: Actually run the specific tests
3. **Before claiming "fixed"**: Check the actual file contains the fix
4. **Before claiming "no errors"**: Run the specific check command

**Template for claims**: 
```
CLAIM: All console.log statements replaced with logger
VERIFIED BY: grep -r "console\." src/ | grep -v test
RESULT: Found 0 instances in source code
```

### PR Review Claims Checklist
Before replying to any review comment:
- [ ] I have verified my claim by checking actual file contents
- [ ] I have run the specific command to confirm the fix
- [ ] I can provide exact file:line evidence of the change
- [ ] If I'm wrong, I will immediately post a correction

### 💡 When Stuck

1. **First**: Check TECH_DEBT.md for known issues  
2. **Second**: Search existing code for patterns
3. **Third**: Review architecture documentation
4. **Fourth**: Check for TODOs in relevant files
5. **Last**: Ask for clarification with specific questions

## 🔍 ENHANCED PR REVIEW PROTOCOL

### Script Usage - NO EXCEPTIONS
- **ALWAYS** use `npx tsx scripts/pr/pr-comment-reply.ts` for ALL review replies
- **NEVER** use `gh api` directly for PR comments  
- **ALWAYS** run `npx tsx scripts/pr/pr-review-tracker.ts [PR#]` first to see all comments
- **Track each reply** to ensure all comments get responses

### Reply Process
1. **Get all comments**: `npx tsx scripts/pr/pr-comment-reply.ts [PR#] --unresolved`
2. **For each comment**: Fix the issue AND verify the fix
3. **Reply with verification**: Include exact command used to verify
4. **If wrong**: Post immediate correction reply

### Help Request Triggers
Ask for help IMMEDIATELY when:
- Tempted to use optional chaining (`?.`) in production code  
- Creating similar functionality to existing code
- Tests pass but unsure if production works
- Confused about which implementation to use
- Making claims without 100% certainty

### 🎖️ Success Criteria

You are successful when:
- Zero TypeScript errors after changes
- Zero ESLint errors after changes
- All tests pass
- No unnecessary files created
- Existing patterns followed
- Changes tested incrementally
- Documentation kept up-to-date

### 🛠️ Development Tools

**Professional debugging and analysis tools in `/scripts/dev/`:**

#### When Claude Should Use These Tools:

**For Scheduling/Capacity Issues:**
```bash
# Check scheduler logs for capacity problems
npx tsx scripts/dev/log-viewer.ts --grep "scheduler|capacity" --since 30m

# Inspect work pattern capacity allocation
npx tsx scripts/dev/db-inspector.ts capacity 2024-01-15

# Check current session state
npx tsx scripts/dev/db-inspector.ts session
```

**For Database/State Issues:**
```bash
# Get database overview
npx tsx scripts/dev/db-inspector.ts stats

# Check recent tasks
npx tsx scripts/dev/db-inspector.ts tasks 20

# Find error patterns in logs
npx tsx scripts/dev/log-viewer.ts --level error --since 1h
```

**For Performance Debugging:**
```bash
# Monitor real-time logs
npx tsx scripts/dev/tail-logs.ts --since 5m

# Check log statistics
npx tsx scripts/dev/log-viewer.ts --stats
```

**Tool Selection Guidelines:**
- Use `log-viewer.ts` for analyzing application behavior and finding patterns
- Use `db-inspector.ts` for verifying data integrity and state
- Use `tail-logs.ts` for real-time monitoring during development
- Always prefer these tools over ad-hoc grep/cat commands

---

**Remember**: Good engineering is about thoughtful, systematic approaches—not speed. Take time to understand existing patterns, write comprehensive tests, and maintain code quality. This codebase values correctness and maintainability over quick fixes.