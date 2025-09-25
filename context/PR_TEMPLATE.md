# PR: [Title]
<!-- Use this template for managing complex PRs -->

## PR Metadata
- **PR Number**: #
- **Branch**: feature/
- **Created**: YYYY-MM-DD
- **Target Merge**: YYYY-MM-DD

## Scope Assessment
- **Files affected**: [Count]
- **Subsystems touched**: [List major areas]
- **Architectural changes**: [Yes/No - If yes, list]
- **Breaking changes**: [Yes/No - If yes, list]
- **Database migrations**: [Yes/No - If yes, list]

## Mental Model
<!-- Describe or diagram the system architecture being changed -->
```
[Component A] --> [Component B]
       |              |
       v              v
[Database]     [Scheduler]
```

### Key Concepts
- **Before**: [How it worked before]
- **After**: [How it works now]
- **Why**: [Reason for the change]

## Change Inventory

### Type System Changes
- [ ] New interfaces defined
- [ ] Existing types modified
- [ ] Enums added/modified
- [ ] Type exports updated

### Database Changes
- [ ] Schema modifications
- [ ] Migration created
- [ ] Seed data updated
- [ ] Indexes optimized

### API Changes
- [ ] New endpoints
- [ ] Modified contracts
- [ ] Deprecated methods
- [ ] Version compatibility

### UI Changes
- [ ] New components
- [ ] Modified components
- [ ] State management updates
- [ ] Event handlers changed

### Test Coverage
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] E2E tests updated
- [ ] Test coverage maintained/improved

## Pattern Fixes Applied
<!-- Track systematic fixes to prevent whack-a-mole -->

### Pattern 1: [e.g., "String literals to enums"]
- **Search command**: `grep -r "pattern" src/`
- **Files searched**: [Count]
- **Instances found**: [Count]
- **Instances fixed**: [Count]
- **Verification command**: `grep -r "pattern" src/ | wc -l` → 0

### Pattern 2: [e.g., "Remove type assertions"]
- **Search command**: `grep -r "as any" src/`
- **Files searched**: [Count]
- **Instances found**: [Count]
- **Instances fixed**: [Count]
- **Verification command**: `grep -r "as any" src/ | wc -l` → 0

## Review Response Tracking

### Round 1 - Initial Review
**Date**: YYYY-MM-DD
**Reviewer**: @username
**Total Comments**: [Count]

#### Pattern Issues (Group similar feedback)
- [ ] **Use enums instead of strings** - [X locations]
  - Files: [List]
  - Status: [Fixed/Pending]
  - Commit: [hash]

- [ ] **Remove type assertions** - [X locations]
  - Files: [List]
  - Status: [Fixed/Pending]
  - Commit: [hash]

#### Specific Issues
- [ ] **Comment 1**: [File:Line] - [Summary]
  - Fix: [Description]
  - Verified: [Command used]
  - Reply posted: [Yes/No]

- [ ] **Comment 2**: [File:Line] - [Summary]
  - Fix: [Description]
  - Verified: [Command used]
  - Reply posted: [Yes/No]

### Round 2 - Follow-up Review
**Date**: YYYY-MM-DD
**Total Comments**: [Count]

<!-- Continue pattern... -->

## Quality Checkpoints

### Pre-Push Checklist
- [ ] TypeScript: `npm run typecheck` → 0 errors
- [ ] Lint: `npm run lint` → 0 errors
- [ ] Tests: `npm test -- --run` → All passing
- [ ] Build: `npm run build` → Success
- [ ] Coverage: Maintained or improved
- [ ] No console.log statements
- [ ] No commented code
- [ ] No TODO without TECH_DEBT.md entry

### Post-Push Verification
- [ ] CI/CD pipeline green
- [ ] Preview deployment working
- [ ] No regression in main features
- [ ] Performance metrics acceptable

## Lessons Learned
<!-- Document what went well and what didn't -->

### What Worked Well
-

### What Didn't Work
-

### Would Do Differently
-

## Time Tracking
- **Estimated**: [Hours]
- **Actual**: [Hours]
- **Review Cycles**: [Count]
- **Rework Time**: [Hours]

## Final Status
- [ ] All comments addressed
- [ ] All replies posted
- [ ] Documentation updated
- [ ] Context files updated
- [ ] Ready for merge