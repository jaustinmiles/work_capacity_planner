# Sleep Pattern Repetition Implementation Plan

## 🎯 Problem Statement

Users need to set sleep schedules that repeat daily/weekly without manually copying to each day. Currently:
- UI shows "daily" repetition option but doesn't work
- Users must manually copy sleep blocks to each day
- Schedule generation should respect sleep blocks but sometimes overwrites them

## 📋 Requirements

### Functional Requirements
1. **Repetition Types**:
   - Daily (same time every day)
   - Weekdays only (Mon-Fri)
   - Weekends only (Sat-Sun)
   - Weekly (specific days)
   - Custom pattern

2. **Behavior**:
   - Apply pattern to future dates automatically
   - Update existing patterns when edited
   - Delete repetitions when pattern deleted
   - Handle conflicts gracefully

3. **Schedule Generation**:
   - NEVER schedule work during sleep blocks
   - NEVER overwrite existing sleep blocks
   - Properly handle cross-midnight sleep (e.g., 11pm-7am)

## 🏗️ Implementation Design

### Database Schema Changes

```prisma
// Add to schema.prisma
model WorkPattern {
  // ... existing fields ...
  
  // Repetition fields
  repetitionType    RepetitionType?   @default(NONE)
  repetitionDays    Int[]            // For weekly: [0,1,2,3,4] = Sun-Thu
  repetitionEndDate DateTime?        // Optional end date
  parentPatternId   String?          // Link to original pattern
  isGenerated      Boolean          @default(false) // Auto-created from repetition
}

enum RepetitionType {
  NONE
  DAILY
  WEEKDAYS
  WEEKENDS
  WEEKLY
  CUSTOM
}
```

### Backend Implementation

```typescript
// src/main/database.ts

async function saveWorkPattern(data: WorkPatternInput) {
  const pattern = await prisma.workPattern.create({
    data: {
      ...data,
      repetitionType: data.repetitionType || RepetitionType.NONE
    }
  })

  // Generate future patterns if repetition is set
  if (data.repetitionType && data.repetitionType !== RepetitionType.NONE) {
    await generateRepetitions(pattern)
  }

  return pattern
}

async function generateRepetitions(pattern: WorkPattern) {
  const repetitions = []
  const startDate = new Date(pattern.date)
  const endDate = pattern.repetitionEndDate || addDays(startDate, 365) // Default 1 year

  for (let date = addDays(startDate, 1); date <= endDate; date = addDays(date, 1)) {
    if (shouldRepeatOnDate(pattern, date)) {
      // Check for existing pattern on this date
      const existing = await prisma.workPattern.findUnique({
        where: { 
          sessionId_date: {
            sessionId: pattern.sessionId,
            date: formatDate(date)
          }
        }
      })

      if (!existing) {
        repetitions.push({
          ...pattern,
          id: undefined, // New ID
          date: formatDate(date),
          parentPatternId: pattern.id,
          isGenerated: true
        })
      }
    }
  }

  // Batch create all repetitions
  if (repetitions.length > 0) {
    await prisma.workPattern.createMany({ data: repetitions })
  }
}

function shouldRepeatOnDate(pattern: WorkPattern, date: Date): boolean {
  const dayOfWeek = date.getDay()

  switch (pattern.repetitionType) {
    case RepetitionType.DAILY:
      return true
    
    case RepetitionType.WEEKDAYS:
      return dayOfWeek >= 1 && dayOfWeek <= 5
    
    case RepetitionType.WEEKENDS:
      return dayOfWeek === 0 || dayOfWeek === 6
    
    case RepetitionType.WEEKLY:
      return pattern.repetitionDays?.includes(dayOfWeek) || false
    
    default:
      return false
  }
}

async function updateWorkPattern(id: string, updates: Partial<WorkPattern>) {
  const pattern = await prisma.workPattern.update({
    where: { id },
    data: updates
  })

  // If repetition settings changed, regenerate
  if ('repetitionType' in updates || 'blocks' in updates) {
    // Delete old generated patterns
    await prisma.workPattern.deleteMany({
      where: { parentPatternId: id }
    })

    // Generate new ones
    if (pattern.repetitionType !== RepetitionType.NONE) {
      await generateRepetitions(pattern)
    }
  }

  return pattern
}

async function deleteWorkPattern(id: string) {
  // Delete pattern and all its repetitions
  await prisma.workPattern.deleteMany({
    where: {
      OR: [
        { id },
        { parentPatternId: id }
      ]
    }
  })
}
```

### Frontend UI Changes

```typescript
// src/renderer/components/settings/WorkBlocksEditor.tsx

interface RepetitionConfig {
  type: RepetitionType
  days?: number[] // For weekly
  endDate?: Date
}

function WorkBlockEditor() {
  const [repetition, setRepetition] = useState<RepetitionConfig>({
    type: RepetitionType.NONE
  })

  return (
    <div>
      {/* Existing block editor */}
      
      <Select
        value={repetition.type}
        onChange={(type) => setRepetition({ ...repetition, type })}
      >
        <Option value="NONE">No repetition</Option>
        <Option value="DAILY">Daily</Option>
        <Option value="WEEKDAYS">Weekdays only</Option>
        <Option value="WEEKENDS">Weekends only</Option>
        <Option value="WEEKLY">Weekly (custom days)</Option>
      </Select>

      {repetition.type === RepetitionType.WEEKLY && (
        <Checkbox.Group
          value={repetition.days}
          onChange={(days) => setRepetition({ ...repetition, days })}
        >
          <Checkbox value={0}>Sun</Checkbox>
          <Checkbox value={1}>Mon</Checkbox>
          <Checkbox value={2}>Tue</Checkbox>
          <Checkbox value={3}>Wed</Checkbox>
          <Checkbox value={4}>Thu</Checkbox>
          <Checkbox value={5}>Fri</Checkbox>
          <Checkbox value={6}>Sat</Checkbox>
        </Checkbox.Group>
      )}

      {repetition.type !== RepetitionType.NONE && (
        <DatePicker
          label="Repeat until"
          value={repetition.endDate}
          onChange={(endDate) => setRepetition({ ...repetition, endDate })}
          placeholder="No end date"
        />
      )}
    </div>
  )
}
```

### Schedule Generation Protection

```typescript
// src/renderer/utils/optimal-scheduler.ts

function hasConflict(
  startTime: Date,
  endTime: Date,
  config: OptimalScheduleConfig
): { hasConflict: boolean; type?: 'sleep' | 'meeting'; until?: Date } {
  // Check sleep blocks from database
  const sleepBlocks = await getSleepBlocksForDate(startTime)
  
  for (const block of sleepBlocks) {
    if (timeOverlaps(startTime, endTime, block.startTime, block.endTime)) {
      return { 
        hasConflict: true, 
        type: 'sleep',
        until: block.endTime 
      }
    }
  }

  // Check meetings...
  // ... existing meeting check code ...
}

// Ensure sleep blocks are loaded and respected
async function generateOptimalSchedule(
  tasks: Task[],
  workflows: SequencedTask[],
  startTime: Date,
  config: OptimalScheduleConfig
): OptimizationResult {
  // Load sleep patterns for next 30 days
  const sleepPatterns = await loadSleepPatterns(startTime, 30)
  
  // Add to config
  config.sleepBlocks = sleepPatterns
  
  // ... rest of scheduling logic that now respects sleep blocks ...
}
```

## 🧪 Testing Requirements

```typescript
// tests/sleep-repetition.test.ts

describe('Sleep Pattern Repetition', () => {
  it('should create daily repetitions', async () => {
    const pattern = await createSleepPattern({
      blocks: [{ startTime: '23:00', endTime: '07:00', type: 'sleep' }],
      repetitionType: RepetitionType.DAILY
    })

    const patterns = await getWorkPatterns({ 
      startDate: today,
      endDate: addDays(today, 7)
    })

    expect(patterns).toHaveLength(8) // Today + 7 days
    patterns.forEach(p => {
      expect(p.blocks[0]).toMatchObject({
        startTime: '23:00',
        endTime: '07:00',
        type: 'sleep'
      })
    })
  })

  it('should not schedule during sleep blocks', async () => {
    await createSleepPattern({
      blocks: [{ startTime: '23:00', endTime: '07:00', type: 'sleep' }],
      repetitionType: RepetitionType.DAILY
    })

    const schedule = await generateSchedule({
      tasks: [{ name: 'Late night task', duration: 120 }]
    })

    // Should not schedule between 11pm and 7am
    schedule.items.forEach(item => {
      const hour = item.startTime.getHours()
      expect(hour).toBeGreaterThanOrEqual(7)
      expect(hour).toBeLessThan(23)
    })
  })

  it('should handle cross-midnight sleep patterns', async () => {
    const pattern = await createSleepPattern({
      date: '2025-08-29',
      blocks: [{ startTime: '22:00', endTime: '06:00', type: 'sleep' }]
    })

    // Should create a block from 10pm Aug 29 to 6am Aug 30
    expect(pattern.blocks[0].crossesMidnight).toBe(true)
  })
})
```

## 📅 Implementation Timeline

### Phase 1: Minimal Implementation (2-3 hours)
1. ✅ Add repetition fields to database schema
2. ✅ Implement daily repetition for sleep blocks
3. ✅ Ensure schedule generation respects sleep blocks
4. ✅ Basic UI for selecting repetition type

### Phase 2: Full Features (4-6 hours)
1. ⏳ Add weekday/weekend repetition options
2. ⏳ Implement weekly custom days
3. ⏳ Add end date selection
4. ⏳ Handle pattern updates/deletions

### Phase 3: Polish (2-3 hours)
1. ⏳ Conflict resolution UI
2. ⏳ Visual indicators for repeated patterns
3. ⏳ Bulk edit/delete options
4. ⏳ Performance optimization for many patterns

## 🚀 Quick Start Implementation

For immediate relief, here's the minimal change needed:

```typescript
// Quick fix in saveWorkPattern
async function saveWorkPattern(data) {
  const pattern = await prisma.workPattern.create({ data })
  
  // If it's a sleep block with daily repetition
  if (data.blocks?.some(b => b.type === 'sleep') && 
      data.repetition === 'daily') {
    
    // Create for next 30 days
    for (let i = 1; i <= 30; i++) {
      const futureDate = addDays(new Date(data.date), i)
      await prisma.workPattern.create({
        data: {
          ...data,
          date: formatDate(futureDate),
          id: undefined // New ID
        }
      })
    }
  }
  
  return pattern
}
```

## 🎯 Success Criteria

1. ✅ Users can set sleep schedule once and it repeats
2. ✅ Schedule generation never overwrites sleep blocks
3. ✅ Cross-midnight sleep patterns work correctly
4. ✅ UI clearly shows which patterns are repeated
5. ✅ Changes to parent pattern update all repetitions

---
*Last Updated: 2025-08-29*