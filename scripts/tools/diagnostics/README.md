# Diagnostic Tools

This directory contains diagnostic scripts for debugging scheduler and database issues. All scripts are generalized and accept parameters rather than hardcoding specific data.

## Available Scripts

### check-task-types.ts
**Purpose**: Analyze task types in the database and identify invalid types.

**Usage**:
```bash
# Check all tasks
npx tsx scripts/tools/diagnostics/check-task-types.ts

# Check tasks for a specific session
npx tsx scripts/tools/diagnostics/check-task-types.ts "Session Name"
```

**When to use**: When tasks are not appearing in the scheduler or have unexpected behavior due to type issues.

### debug-scheduler-state.ts
**Purpose**: Deep dive into the scheduler's state and trace the full scheduling pipeline.

**Usage**:
```bash
# Debug scheduler for current time
npx tsx scripts/tools/diagnostics/debug-scheduler-state.ts

# Debug for a specific date
npx tsx scripts/tools/diagnostics/debug-scheduler-state.ts --date "2025-01-15"
```

**When to use**: When the scheduler is not producing expected results or crashes.

### debug-workpatterns.ts
**Purpose**: Analyze work patterns and their capacity calculations for a specific session.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/debug-workpatterns.ts "Session Name"
```

**Output**: Creates detailed JSON files in `debug-output/` directory with work pattern analysis.

**When to use**: When work blocks show incorrect capacity or meetings aren't blocking time properly.

### parse-scheduler-logs.ts
**Purpose**: Parse and analyze scheduler logs to identify patterns and issues.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/parse-scheduler-logs.ts
```

**When to use**: After a scheduler run to understand what decisions were made and why.

### scheduler-deep-dive.ts
**Purpose**: Comprehensive analysis of the entire scheduling system.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/scheduler-deep-dive.ts
```

**When to use**: For initial investigation of scheduling issues.

### trace-block-properties.ts
**Purpose**: Trace how work block properties are calculated and used.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/trace-block-properties.ts
```

**When to use**: When block capacity calculations seem incorrect.

### trace-capacity.ts
**Purpose**: Trace capacity calculations through the scheduling pipeline.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/trace-capacity.ts
```

**When to use**: When total capacity doesn't match expected values.

### trace-start-next-task.ts
**Purpose**: Trace the flow when the "Start Next Task" button is clicked.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/trace-start-next-task.ts
```

**When to use**: When the "Start Next Task" button isn't working correctly.

### verify-block-properties.ts
**Purpose**: Verify that work block properties are correctly set.

**Usage**:
```bash
npx tsx scripts/tools/diagnostics/verify-block-properties.ts
```

**When to use**: To validate block configuration after changes.

### verify-root-cause.ts
**Purpose**: Verify potential root causes of scheduling issues.

**Usage**:
```bash
# Check general issues
npx tsx scripts/tools/diagnostics/verify-root-cause.ts

# Check specific session
npx tsx scripts/tools/diagnostics/verify-root-cause.ts "session-id"
```

**When to use**: After identifying a potential issue to verify it's the root cause.

## Best Practices

1. **Never hardcode personal information** - Always use parameters
2. **Never hardcode dates** - Use current date or accept as parameter
3. **Clean up output files** - Delete debug output after investigation
4. **Document findings** - Add comments about what issues were found

## Common Issues These Tools Help Debug

1. **Tasks not scheduling**: Use `check-task-types.ts` and `debug-scheduler-state.ts`
2. **Incorrect capacity**: Use `trace-capacity.ts` and `verify-block-properties.ts`
3. **Meetings not blocking time**: Use `debug-workpatterns.ts`
4. **"Start Next Task" not working**: Use `trace-start-next-task.ts`
5. **General scheduler issues**: Start with `scheduler-deep-dive.ts`

## Output

Most scripts output to console. Some create files in `debug-output/` directory which should be added to `.gitignore` and cleaned up after use.