# PR Workflow Checklist

## 🚀 Phase 1: Pre-Implementation (2 hours maximum)

### Setup
- [ ] Create new branch from main: `git checkout -b feature/[name]`
- [ ] Run bot authentication: `./context/setup-claude-bot.sh`
- [ ] Verify clean start: `npm run typecheck && npm run lint`

### Research & Planning
- [ ] Read all related code using Glob/Grep tools
- [ ] Document current architecture in PR_TEMPLATE.md
- [ ] Identify all files that will be touched
- [ ] Count files - if >20, plan how to split PR

### Architecture Documentation
- [ ] Create/update mental model diagram
- [ ] List all subsystems involved
- [ ] Identify integration points
- [ ] Document data flow

### Type Definition Phase
- [ ] Define all new interfaces FIRST
- [ ] Create/update enums BEFORE using them
- [ ] Export types from appropriate modules
- [ ] NO implementation yet - types only

### Validation Gate
**STOP if any are true:**
- [ ] Touching more than 20 files
- [ ] Affecting more than 3 subsystems
- [ ] Unclear about architecture
- [ ] No existing patterns to follow

## 📝 Phase 2: Implementation

### Every 3 Files Checkpoint
- [ ] Run: `npm run typecheck`
- [ ] Fix any type errors immediately
- [ ] Commit if clean

### Every 5 Files Checkpoint
- [ ] Run: `npm run lint`
- [ ] Fix all lint errors (use `--fix` if appropriate)
- [ ] No `any` types added
- [ ] No `@ts-ignore` added

### Every 10 Files Checkpoint
- [ ] Run: `npm test -- --run`
- [ ] All tests must pass
- [ ] Check for console.log statements
- [ ] Review changes for patterns

### Every 2 Hours Checkpoint
- [ ] Update `/context/state.md`
- [ ] Document any decisions in `/context/decisions.md`
- [ ] Take 5-minute break
- [ ] Review if scope is creeping

### Pattern Fix Protocol
When fixing any pattern (strings→enums, any→types, etc.):
- [ ] Search globally FIRST: `grep -r "pattern" src/`
- [ ] Document count of instances found
- [ ] Fix ALL instances in one commit
- [ ] Verify none remain: `grep -r "pattern" src/`
- [ ] Commit message includes search commands used

### Commit Discipline
Each commit should:
- [ ] Fix one logical issue
- [ ] Have clear, specific message
- [ ] Include verification in message if applicable
- [ ] Not mix different types of changes

## 🔍 Phase 3: Pre-Push Quality Gates

### Comprehensive Search Verification
Run these searches and fix any findings:
```bash
- [ ] grep -r "as any" src/                    # No any types
- [ ] grep -r "@ts-ignore" src/                # No ignored errors
- [ ] grep -r "console\\.log" src/ | grep -v test  # No console.logs
- [ ] grep -r "TODO" src/ | grep -v TECH_DEBT  # TODOs documented
- [ ] grep -r "\\?\\." src/ | grep -v test     # No suspicious optional chaining
```

### Quality Checks (ALL must pass)
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] `npm test -- --run` → All tests pass
- [ ] `npm run build` → Builds successfully

### Documentation Updates
- [ ] `/context/state.md` - Current status
- [ ] `/context/decisions.md` - Technical decisions
- [ ] `/context/insights.md` - Lessons learned
- [ ] `TECH_DEBT.md` - Any new debt or TODOs

### Final Verification
- [ ] Feature works in dev mode (not just tests)
- [ ] Database changes persist
- [ ] UI updates properly
- [ ] Logging works correctly
- [ ] No regression in existing features

## 📬 Phase 4: PR Creation

### Pre-PR Checklist
- [ ] Squash commits if >20 (optional)
- [ ] Review diff one more time
- [ ] Check file count (<20 for most PRs)
- [ ] Prepare PR description

### PR Description Must Include
- [ ] What changed and why
- [ ] How to test the changes
- [ ] Any breaking changes
- [ ] Screenshots if UI changes
- [ ] Related issue numbers

### Create PR
```bash
# Use bot account
./context/setup-claude-bot.sh
gh pr create --title "feat: [description]" --body "[details]"
```

## 🔄 Phase 5: Review Response

### Initial Review Triage
- [ ] Run: `npx tsx scripts/pr/pr-review-tracker.ts [PR#]`
- [ ] Read ALL comments before fixing anything
- [ ] Group similar feedback
- [ ] Create fix plan in PR_TEMPLATE.md

### Three-Pass Protocol
**Pass 1: Understand**
- [ ] Read all comments
- [ ] Identify patterns
- [ ] Group related issues
- [ ] No fixes yet

**Pass 2: Plan**
- [ ] Create grouped fix list
- [ ] Determine fix order
- [ ] Identify dependencies
- [ ] Still no fixes

**Pass 3: Execute**
- [ ] Fix pattern issues first
- [ ] Fix specific issues second
- [ ] Verify each fix
- [ ] Post reply after each fix

### Reply Protocol
For each comment:
- [ ] Fix the issue
- [ ] Verify the fix works
- [ ] Post reply with verification
```bash
npx tsx scripts/pr/pr-comment-reply.ts [PR#] [comment-id] "Fixed! [details]"
```

### Verification After Review
- [ ] Run pr-review-tracker.ts → 0 unresolved
- [ ] All comments have replies
- [ ] All fixes verified
- [ ] Quality checks still pass

## 🚫 Emergency Stops

**STOP and ask for help if:**
- [ ] Tempted to use `any` type
- [ ] Adding `@ts-ignore`
- [ ] Using optional chaining to hide missing methods
- [ ] Tests pass but production doesn't work
- [ ] More than 30 files changed
- [ ] More than 5 review rounds
- [ ] Same issue fixed multiple times
- [ ] Scope significantly expanded

## 📊 Metrics to Track

After PR is merged, record:
- [ ] Total time from start to merge
- [ ] Number of commits
- [ ] Number of review rounds
- [ ] Files changed
- [ ] Lines added/removed
- [ ] Test coverage change
- [ ] Any production issues

## 🎯 Success Criteria

Your PR is successful when:
- [ ] Merged in <3 review rounds
- [ ] No follow-up fixes needed
- [ ] No production issues
- [ ] Reviewer happy with changes
- [ ] You learned something new
- [ ] Documentation is better
- [ ] Technical debt reduced (not added)