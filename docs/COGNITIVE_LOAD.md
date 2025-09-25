# Cognitive Load Management for Developers

## The PR #76 Cognitive Collapse

During PR #76, cognitive overload caused:
- Same bugs fixed multiple times
- False claims of completion
- Type safety abandoned for `any`
- Missing obvious errors
- Communication breakdown

This document provides strategies to prevent cognitive overload.

## Understanding Cognitive Load

### The Three Types

1. **Intrinsic Load** (Essential Complexity)
   - Understanding the business domain
   - Learning the codebase structure
   - Grasping architectural patterns
   - ✅ Cannot be reduced, must be managed

2. **Extraneous Load** (Accidental Complexity)
   - Poor documentation
   - Inconsistent patterns
   - Bad tooling
   - ❌ Can and should be eliminated

3. **Germane Load** (Learning Investment)
   - Building mental models
   - Creating abstractions
   - Pattern recognition
   - ✅ Beneficial, should be optimized

## The Cognitive Budget Model

```
┌─────────────────────────────────────────┐
│  Your Daily Cognitive Budget: 100 units       │
└─────────────────────────────────────────┘

Typical Costs:
- Understanding new code: 10-20 units
- Debugging complex issue: 20-30 units
- Context switch: 5-10 units
- Fighting tools/types: 15-20 units
- Code review response: 15-25 units

When budget depleted:
- Error rate increases 3x
- "Quick fixes" become disasters
- Communication breaks down
- Type safety abandoned
```

## Context Switching Penalty

### The 15-Minute Rule
```
┌─────────────┐
│ Deep Focus  │  0-15 min: Building context
│    Zone     │  15-45 min: Peak productivity
│             │  45+ min: Diminishing returns
└─────────────┘
       ↓ 
  [INTERRUPTION]
       ↓
┌─────────────┐
│  Lost Time  │  15 min: Context recovery
│             │  + Previous progress forgotten
│             │  + Mental model rebuilding
└─────────────┘
```

### File Switching Costs
```python
# Cognitive cost formula
cost = base_cost + (files_open * complexity_factor) + (switches * switch_penalty)

where:
  base_cost = 10
  complexity_factor = 2
  switch_penalty = 5

# Example: 20 files, 10 switches
cost = 10 + (20 * 2) + (10 * 5) = 100 units (budget exhausted!)
```

## Strategies for Managing Load

### 1. The Chunking Strategy

**Break large changes into cognitive chunks:**

```
Large PR (40 files) → Cognitive Overload ❌

          ↓ Break Down

Chunk 1: Type definitions (5 files)
Chunk 2: Core logic update (8 files)
Chunk 3: UI updates (7 files)
Chunk 4: Test updates (10 files)

= Manageable Cognitive Load ✅
```

### 2. The Systematic Pattern

**Don't jump between instances, fix systematically:**

```bash
# WRONG: High cognitive load
Fix file A line 10 → Fix file B line 20 → Back to file A line 50...

# RIGHT: Low cognitive load
Find all instances → Group by pattern → Fix all in file A → Move to file B
```

### 3. The Documentation-First Approach

**Offload memory to documentation:**

```markdown
## Current State
- Working on: Capacity field unification
- Files touched: [List]
- Patterns found: [List]
- Decisions made: [List]
- Next steps: [List]
```

This becomes your external brain, reducing working memory load.

### 4. The Verification Checkpoint

**Regular verification reduces anxiety load:**

```bash
# Every 3 files
npm run typecheck  # Verify no type errors

# Every 5 files  
npm run lint       # Verify code quality

# Every 10 files
npm test -- --run  # Verify nothing broken
```

Knowing things work reduces background anxiety.

### 5. The Type-First Method

**Define types before implementation:**

```typescript
// FIRST: Define the shape (low cognitive load)
interface TaskScheduleData {
  taskId: string
  workBlockId: string
  startTime: Date
  duration: number
  capacity: BlockCapacity
}

// THEN: Implement (types guide you)
function scheduleTask(data: TaskScheduleData) {
  // TypeScript helps reduce cognitive load here
}
```

## Warning Signs of Overload

### Early Warning (50-70% capacity)
- 🟡 Starting to forget why you made changes
- 🟡 Tempted to skip tests "just this once"
- 🟡 Copy-pasting without understanding

### Danger Zone (70-90% capacity)
- 🟠 Reaching for `any` type
- 🟠 Making the same fix twice
- 🟠 Can't explain what you're doing
- 🟠 Skipping verification steps

### Critical Overload (90-100% capacity)
- 🔴 Using `@ts-ignore`
- 🔴 "It works on my machine"
- 🔴 Can't remember the original goal
- 🔴 Communication breakdown
- 🔴 Angry at the code/tools

### Recovery Required (>100% capacity)
- ☠️ Making things worse with each "fix"
- ☠️ Complete context loss
- ☠️ Unable to understand own code
- ☠️ PR becomes unsalvageable

## Recovery Strategies

### The Step-Back Protocol

When you recognize overload:

1. **STOP** (Don't dig deeper)
   ```bash
   git add -A
   git commit -m "WIP: Stepping back to reduce cognitive load"
   ```

2. **DOCUMENT** (Offload from working memory)
   ```markdown
   ## Brain Dump
   - What I was trying to do: ...
   - What went wrong: ...
   - What I've tried: ...
   - What I'm confused about: ...
   ```

3. **SIMPLIFY** (Reduce scope)
   - Pick ONE thing to fix
   - Fix it completely
   - Verify it works
   - Then move to next

4. **VERIFY** (Rebuild confidence)
   ```bash
   npm run typecheck
   npm run lint
   npm test -- --run
   ```

5. **FRESH START** (If needed)
   ```bash
   # Sometimes starting over is faster
   git checkout -b feature-name-fresh main
   # Apply lessons learned
   ```

## Cognitive Load Optimization Patterns

### Pattern 1: The Scout Rule
"Leave code better than you found it, but not perfect"

```typescript
// Found this:
function calc(x: any, y: any): any { ... }

// Improvement (manageable):
function calculate(amount: number, rate: number): number { ... }

// NOT this (scope creep):
// Refactoring entire calculation system...
```

### Pattern 2: The Breadcrumb Trail
"Document your path for your future self"

```typescript
// TODO(2024-01-15): Temporary workaround for capacity issue
// Real fix requires updating scheduler (see TECH_DEBT.md#scheduler)
// Current approach: Using default capacity when not specified
const capacity = workBlock.capacity ?? DEFAULT_CAPACITY
```

### Pattern 3: The Incremental Migration
"Change gradually, verify constantly"

```bash
# Instead of: Update all 40 files at once
# Do this:
Update 5 files → Commit → Verify →
Update 5 files → Commit → Verify →
... repeat
```

## Tools for Cognitive Support

### 1. External Memory Tools
- **PR Template**: Track what you're doing
- **Todo List**: Offload task tracking
- **Git Commits**: Document incremental progress
- **Comments**: Explain complex logic

### 2. Verification Tools
- **TypeScript**: Catches errors you'd miss
- **ESLint**: Enforces patterns
- **Tests**: Verify behavior
- **Scripts**: Automate repetitive checks

### 3. Exploration Tools
- **grep/ripgrep**: Find all instances
- **VSCode Search**: Visual pattern finding
- **Git blame**: Understand history
- **Documentation**: Reduce memory load

## The Cognitive Load Checklist

### Before Starting Work
- [ ] Am I well-rested? (Tired = 50% capacity)
- [ ] Do I understand the goal?
- [ ] Have I documented the plan?
- [ ] Is the scope manageable? (<20 files)
- [ ] Do I have uninterrupted time?

### During Work
- [ ] Am I making incremental progress?
- [ ] Am I verifying changes regularly?
- [ ] Am I documenting decisions?
- [ ] Am I tempted by shortcuts? (Warning sign!)
- [ ] Can I explain what I'm doing?

### When Struggling
- [ ] Have I been working >2 hours straight?
- [ ] Am I trying to hold too much in memory?
- [ ] Should I document and take a break?
- [ ] Am I making the same mistakes?
- [ ] Should I ask for help?

### After Work Session
- [ ] Document current state
- [ ] Commit work in progress
- [ ] Note any confusion/blockers
- [ ] Plan next session's starting point

## The Science Behind It

### Miller's Law: 7±2
Working memory holds 5-9 items. Each file/concept uses slots:
- 3 files = comfortable
- 7 files = at capacity  
- 10+ files = overload, errors increase

### Cognitive Load Theory
- **Split Attention Effect**: Jumping between files hurts comprehension
- **Expertise Reversal**: Experts need different strategies than beginners
- **Worked Example Effect**: Following patterns reduces load

### Flow State Requirements
1. Clear goals
2. Immediate feedback
3. Balance of challenge/skill
4. No interruptions
5. Sense of control

## Personal Cognitive Management

### Know Your Peak Hours
```
Morning Person:         Night Owl:
6am  ███ Low           6am  █ Very Low
9am  █████ Peak        9am  ██ Low
12pm ████ Good         12pm ███ Medium
3pm  ██ Low            3pm  ████ Good
6pm  █ Very Low        6pm  █████ Peak
9pm  █ Exhausted       9pm  ████ Good

Schedule complex work during peak hours!
```

### Your Cognitive Profile

Track and learn:
- How many files can you handle?
- How long before fatigue?
- What increases your load most?
- What recovery methods work?
- When are your peak hours?

## Recovery Activities

### Quick Recovery (5 minutes)
- Walk around
- Drink water
- Look out window
- Deep breathing
- Stretch

### Medium Recovery (15 minutes)
- Short walk outside
- Coffee/tea break
- Chat with someone
- Listen to music
- Meditate

### Full Recovery (30+ minutes)
- Exercise
- Nap
- Meal break
- Complete context switch
- Hobby activity

## The Ultimate Rule

> **When cognitive load exceeds 80%, STOP.**
> 
> Every decision made under overload creates technical debt.
> Every shortcut taken will require 10x effort to fix later.
> Every `any` type will haunt you in review.
>
> It's not about working harder; it's about working within your cognitive capacity.

## Quick Reference Card

```
🟢 Green Zone (0-50%)
- Peak performance
- Take on complex tasks
- Good time for learning

🟡 Yellow Zone (50-70%)  
- Still productive
- Stick to familiar patterns
- Increase verification

🟠 Orange Zone (70-90%)
- Error-prone
- Simplify tasks
- Document everything
- Consider breaking

🔴 Red Zone (90-100%)
- STOP
- Document state
- Take break
- Return when recovered

⛔ Danger Zone (>100%)
- Step away immediately
- You're making things worse
- Need extended recovery
- Consider fresh start
```

---

*Remember: Cognitive overload isn't a personal failure. It's a signal that the work needs to be restructured. Respect your cognitive limits, and the code will respect you back.*