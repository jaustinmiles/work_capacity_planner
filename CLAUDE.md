# CLAUDE.md - Engineering Excellence Guidelines

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It follows Constitutional AI principles and research-based strategies for optimal AI-assisted development.

## 🔴 CRITICAL: CONTEXT PRESERVATION PROTOCOL

**THE `/context/` FOLDER IS YOUR MEMORY ACROSS SESSIONS - UPDATE IT OR LOSE CRITICAL INFORMATION**

### MANDATORY Context Updates

**After EVERY significant task or finding:**
1. Update `/context/state.md` with current progress and blockers
2. Update `/context/insights.md` with new learnings or patterns discovered
3. Update `/context/decisions.md` if any technical decisions were made
4. Update `/context/schema.md` if data structures changed

**Before starting ANY new session:**
1. Read ALL files in `/context/` directory
2. Continue from where the last session ended
3. Check state.md for incomplete tasks and blockers

**The context folder implements LCMP (Long-term Context Management Protocol):**
- `state.md` - Current tasks, blockers, session progress
- `schema.md` - Data structures, key definitions  
- `decisions.md` - Technical choices with rationale
- `insights.md` - Cumulative findings from each session

**Failure to maintain context files results in:**
- Repeated mistakes across sessions
- Lost progress on complex tasks
- Duplicate implementations
- Conflicting technical decisions

## 🏗️ Project Constitution & AI Guidelines

### 🚨 CRITICAL CODING WORKFLOW
**MANDATORY ORDER FOR EVERY CHANGE:**
1. **Search First**: Find existing implementations before creating new code
2. **Document Findings**: Explain what was found and justify any new code
3. **Test First**: Write tests that FAIL initially
4. **Implement Minimally**: Write just enough code to pass tests
5. **Verify Quality**: Run format → lint → typecheck → test
6. **Commit Atomically**: One logical change per commit with clear messages

### 🔍 PR REVIEW PROTOCOL - MANDATORY
**Before making ANY changes based on PR feedback:**
1. **Check GitHub PR Comments**: Use `gh pr view [PR#] --comments` to see all review comments
2. **Address EVERY Comment**: Each comment must be either:
   - Fixed with a code change
   - Responded to with explanation why not changed
   - Discussed with reviewer if unclear
3. **Never ignore review comments** - This is a critical failure
4. **Look for patterns** in feedback - recurring issues indicate systematic problems

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

**During Review:**
```bash
# Get ALL comments including inline
gh pr view [PR#] --comments
npx tsx scripts/pr/pr-review-tracker.ts [PR#]

# Address EVERY item - track with TodoWrite
# Never say "unrelated to my changes"
# All failures are our responsibility
```

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

### 💡 When Stuck

1. **First**: Check TECH_DEBT.md for known issues
2. **Second**: Search existing code for patterns
3. **Third**: Review architecture documentation
4. **Fourth**: Check for TODOs in relevant files
5. **Last**: Ask for clarification with specific questions

### 🎖️ Success Criteria

You are successful when:
- Zero TypeScript errors after changes
- Zero ESLint errors after changes
- All tests pass
- No unnecessary files created
- Existing patterns followed
- Changes tested incrementally
- Documentation kept up-to-date

---

**Remember**: Good engineering is about thoughtful, systematic approaches—not speed. Take time to understand existing patterns, write comprehensive tests, and maintain code quality. This codebase values correctness and maintainability over quick fixes.