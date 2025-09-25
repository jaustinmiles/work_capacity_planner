# PR Metrics: Measuring Development Health

## Why Track PR Metrics?

PR #76 took 48 hours instead of 10. Without metrics, we can't:
- Identify patterns of struggle
- Measure improvement
- Predict problem PRs early
- Justify process changes

This document defines what we measure and why.

## Key Metrics to Track

### 1. PR Size Metrics

```yaml
Files Changed:
  Ideal: <10 files
  Acceptable: 10-20 files
  Warning: 20-30 files
  Danger: >30 files

Lines Changed:
  Ideal: <500 lines
  Acceptable: 500-1000 lines
  Warning: 1000-2000 lines
  Danger: >2000 lines

Commits:
  Ideal: 1-5 atomic commits
  Acceptable: 5-10 commits
  Warning: 10-20 commits
  Danger: >20 commits (needs squashing)
```

### 2. Time Metrics

```yaml
Time to First Review:
  Target: <4 hours
  Current: ~8 hours
  
Time in Review:
  Target: <8 hours total
  Current: ~24 hours
  
Time to Merge:
  Target: <24 hours
  Current: ~48 hours
  
Active Development Time:
  Target: <8 hours
  Current: ~20 hours
```

### 3. Quality Metrics

```yaml
Review Rounds:
  Ideal: 1 round
  Acceptable: 2 rounds
  Warning: 3 rounds
  Danger: >3 rounds

Review Comments:
  Ideal: <5 comments
  Acceptable: 5-10 comments
  Warning: 10-20 comments
  Danger: >20 comments

Type Errors Introduced:
  Target: 0
  Current Average: ~5

Tests Added/Modified:
  Target: >0 for any logic change
  Current: ~50% of PRs
```

### 4. Pattern Metrics

```yaml
Anti-Patterns Found:
  "as any" usage: 0 (target)
  "@ts-ignore": 0 (target)
  Console.log: 0 (target)
  Optional chaining abuse: 0 (target)

Pattern Violations:
  Duplicate code: <3 instances
  Inconsistent naming: <5 instances
  Missing types: 0 instances
```

## PR Health Score Calculation

```typescript
interface PRHealthScore {
  size: number       // 0-100 (lower is better)
  time: number       // 0-100 (lower is better)
  quality: number    // 0-100 (higher is better)
  overall: number    // 0-100 (higher is better)
}

function calculatePRHealth(metrics: PRMetrics): PRHealthScore {
  // Size score (penalize large PRs)
  const sizeScore = Math.min(100, 
    (metrics.filesChanged * 2) + 
    (metrics.linesChanged / 20)
  )
  
  // Time score (penalize long PRs)
  const timeScore = Math.min(100,
    (metrics.hoursToMerge * 2) +
    (metrics.reviewRounds * 10)
  )
  
  // Quality score (reward good practices)
  const qualityScore = Math.max(0,
    100 - 
    (metrics.typeErrors * 10) -
    (metrics.antiPatterns * 5) -
    (metrics.reviewComments * 2)
  )
  
  // Overall health
  const overall = Math.round(
    (100 - sizeScore * 0.3) +
    (100 - timeScore * 0.3) +
    (qualityScore * 0.4)
  ) / 3
  
  return { size: sizeScore, time: timeScore, quality: qualityScore, overall }
}
```

## Tracking Template

```markdown
## PR #[NUMBER] Metrics

### Basic Info
- **Title**: [PR Title]
- **Author**: [Author]
- **Date**: [YYYY-MM-DD]
- **Branch**: [Branch Name]

### Size Metrics
- Files Changed: [count]
- Lines Added: [count]
- Lines Removed: [count]
- Commits: [count]

### Time Metrics
- Created: [timestamp]
- First Review: [timestamp] ([X] hours)
- Final Approval: [timestamp] ([X] hours)
- Merged: [timestamp] ([X] hours total)
- Active Dev Time: [X] hours

### Review Metrics
- Review Rounds: [count]
- Total Comments: [count]
- Unresolved Comments: [count]
- Reviewers: [list]

### Quality Metrics
- Type Errors Fixed: [count]
- Lint Issues Fixed: [count]
- Tests Added: [count]
- Tests Modified: [count]
- Coverage Change: [+/-X%]

### Anti-Pattern Scan
- [ ] No `as any` types
- [ ] No `@ts-ignore`
- [ ] No console.log
- [ ] No optional chaining abuse
- [ ] No duplicate code

### Health Score
- Size Score: [X/100]
- Time Score: [X/100]
- Quality Score: [X/100]
- **Overall: [X/100]**

### Notes
[Any special circumstances or learnings]
```

## Historical Tracking

### PR Metrics History

| PR # | Files | Lines | Hours | Rounds | Comments | Score | Status |
|------|-------|-------|-------|--------|----------|-------|---------|
| #76  | 40+   | 2000+ | 48    | 3      | 29       | 25/100 | 🔴 Disaster |
| #75  | 15    | 800   | 12    | 2      | 10       | 65/100 | 🟡 OK |
| #74  | 8     | 400   | 6     | 1      | 5        | 85/100 | 🟢 Good |
| #73  | 25    | 1200  | 24    | 2      | 15       | 55/100 | 🟠 Warning |

### Trend Analysis

```
Average PR Health Score Over Time:

Week 1: ████████ 40/100
Week 2: ██████████ 50/100
Week 3: ██████ 30/100  ← PR #76 impact
Week 4: ████████████ 60/100  ← Process improvements
Target: ██████████████ 70/100
```

## Automated Metrics Collection

### GitHub API Script

```typescript
// scripts/dev/pr-metrics-collector.ts
import { execSync } from 'child_process'

interface PRData {
  number: number
  title: string
  filesChanged: number
  additions: number
  deletions: number
  commits: number
  reviewRounds: number
  comments: number
  createdAt: Date
  mergedAt: Date | null
}

function collectPRMetrics(prNumber: number): PRData {
  // Get PR data from GitHub
  const prJson = execSync(
    `gh pr view ${prNumber} --json number,title,files,additions,deletions,commits,reviews,comments,createdAt,mergedAt`,
    { encoding: 'utf8' }
  )
  
  const data = JSON.parse(prJson)
  
  // Calculate review rounds
  const reviews = data.reviews || []
  const reviewRounds = new Set(reviews.map(r => r.submittedAt?.split('T')[0])).size
  
  return {
    number: data.number,
    title: data.title,
    filesChanged: data.files?.length || 0,
    additions: data.additions,
    deletions: data.deletions,
    commits: data.commits?.length || 0,
    reviewRounds,
    comments: data.comments?.length || 0,
    createdAt: new Date(data.createdAt),
    mergedAt: data.mergedAt ? new Date(data.mergedAt) : null,
  }
}
```

### Daily Metrics Dashboard

```markdown
# Daily PR Metrics Dashboard

## Today's PRs
| PR | Health | Status | Action Needed |
|----|--------|--------|---------------|
| #78 | 75/100 | 🟢 | Ready to merge |
| #79 | 45/100 | 🟠 | Needs size reduction |
| #80 | 30/100 | 🔴 | Consider splitting |

## Week Summary
- PRs Opened: 5
- PRs Merged: 3
- Average Health: 55/100
- Average Time to Merge: 28 hours

## Red Flags 😨
- PR #80 has 35 files changed
- PR #79 has been open for 72 hours
- PR #78 has 3 review rounds
```

## Leading Indicators (Predict Problems Early)

### Early Warning Signs

```yaml
Within First Hour:
  Files > 20: 🔴 Will likely struggle
  No tests: 🟠 Will get review pushback
  Multiple subsystems: 🟠 Complex review

Within First Review:
  Comments > 10: 🔴 Major rework likely
  "Please split": 🔴 Start over recommended
  Type errors: 🟠 Quality issues

After Second Review:
  Same issues: 🔴 Communication breakdown
  New issues: 🟠 Whack-a-mole pattern
  Reviewer frustration: 🔴 Trust eroding
```

### Intervention Triggers

When to step back and reconsider:

1. **Size Trigger**: >25 files → Split immediately
2. **Time Trigger**: >24 hours in review → Sync with reviewer
3. **Round Trigger**: >2 review rounds → Reassess approach
4. **Comment Trigger**: >15 comments → Consider starting fresh
5. **Confusion Trigger**: Can't explain changes → Document and simplify

## Success Patterns to Replicate

### Characteristics of Healthy PRs

```yaml
PR #74 (Score: 85/100):
  - Clear, focused objective
  - 8 files, all related
  - Tests included
  - Self-documented code
  - One review round
  - Merged in 6 hours

Patterns:
  - Single responsibility
  - Incremental changes
  - Proactive testing
  - Clear communication
  - Quick iteration
```

## Metrics-Driven Improvements

### Action Items from Metrics

| Metric | Current | Target | Action |
|--------|---------|--------|--------|
| Avg Files/PR | 22 | <15 | Enforce PR splitting |
| Avg Review Rounds | 2.3 | <2 | Better self-review |
| Type Errors/PR | 5 | 0 | Run typecheck before push |
| Time to Merge | 32hr | <24hr | Smaller, focused PRs |
| Anti-patterns/PR | 8 | 0 | Use pattern-finder.ts |

### Improvement Tracking

```
Month 1 Baseline:
  Health Score: 45/100
  Problem PRs: 40%
  
Month 2 (With Process):
  Health Score: 55/100 ↑
  Problem PRs: 25% ↓
  
Month 3 Target:
  Health Score: 70/100
  Problem PRs: <15%
```

## Team Metrics

### Individual Patterns

```yaml
Developer A:
  Strength: Small, focused PRs
  Weakness: Missing tests
  Action: Test-writing training

Developer B:  
  Strength: Comprehensive tests
  Weakness: Large PR sizes
  Action: PR splitting coaching

Claude (AI):
  Strength: Following patterns
  Weakness: Context overload on large PRs
  Action: Enforce size limits
```

## Reporting Templates

### Weekly PR Report

```markdown
# Week of [Date] PR Metrics

## Summary
- Total PRs: [X]
- Average Health Score: [X/100]
- On-Time Merge Rate: [X%]

## Highlights
- Best PR: #[X] (Score: [X/100])
- Most Improved: [Developer]
- Process Win: [Description]

## Concerns
- [Issue 1]
- [Issue 2]

## Action Items
- [ ] [Action 1]
- [ ] [Action 2]
```

### Monthly Retrospective

```markdown
# [Month] PR Metrics Retrospective

## Trends
- Health Score Trend: [Improving/Declining]
- Average PR Size: [Trend]
- Review Efficiency: [Trend]

## Successes
- [Success 1]
- [Success 2]

## Failures
- [Failure 1]
- [Failure 2]

## Process Changes
- [Change 1]
- [Change 2]

## Next Month Goals
- [ ] [Goal 1]
- [ ] [Goal 2]
```

## The Ultimate Metrics

### The Only Metrics That Matter

1. **Developer Happiness**: Are PRs less painful?
2. **Deployment Confidence**: Do we trust our merges?
3. **Customer Impact**: Fewer production issues?
4. **Team Velocity**: Shipping faster with quality?

If these aren't improving, the other metrics don't matter.

## Quick Reference

### Check PR Health
```bash
# Before pushing
npx tsx scripts/dev/pr-health-check.ts

# Get metrics
gh pr view [PR#] --json files,additions,deletions,commits

# Pattern check
npx tsx scripts/dev/pattern-finder.ts
```

### Health Score Bands
- 🟢 **Healthy** (70-100): Merge with confidence
- 🟡 **Acceptable** (50-70): Minor improvements needed
- 🟠 **Warning** (30-50): Significant issues to address
- 🔴 **Critical** (0-30): Consider starting over

### Remember

> "What gets measured gets managed." - Peter Drucker
>
> "Without data, you're just another person with an opinion." - W. Edwards Deming
>
> "PR #76 could have been prevented with metrics." - Retrospective

---

*Track ruthlessly. Improve systematically. Ship confidently.*