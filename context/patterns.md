# State Management & Architecture Patterns

## Data Flow Architecture

```
UI Component → Zustand Store → IPC Bridge → Main Process → Database Service → Prisma → SQLite
     ↑                                                                                      ↓
     ←────────────────────────── Response with formatted data ←────────────────────────────
```

## Key Patterns

### 1. Single Source of Truth
- **Database Schema**: `/prisma/schema.prisma` - Authoritative data model
- **Type Definitions**: `/src/shared/types.ts` - TypeScript interfaces
- **Store**: Zustand stores in `/src/renderer/store/` - Client state

### 2. Data Persistence Flow

#### Creating/Updating Entities
1. User interacts with UI component
2. Component validates and prepares data
3. Component calls store method (e.g., `updateTask`)
4. Store method sends IPC message to main process
5. Main process calls database service method
6. Database service validates and transforms data
7. Prisma executes SQL query
8. Response flows back through chain

#### Critical Points Where Fields Get Lost
- **Component Data Cleaning**: When preparing data for save
- **Store Method**: When passing to IPC
- **Database Service**: When filtering allowed fields
- **Prisma Schema**: When field doesn't exist in schema

### 3. Common Data Transformation Patterns

#### Arrays/JSON Fields
```typescript
// Saving: JavaScript → Database
dependencies: JSON.stringify(task.dependencies)

// Loading: Database → JavaScript
dependencies: task.dependencies ? JSON.parse(task.dependencies) : []
```

#### Optional Fields
```typescript
// Use undefined for "not set", null for "explicitly cleared"
deadline: dateValue || null
importance: step.importance || undefined
```

#### Complex Objects (Steps)
```typescript
// Always include ALL fields when updating steps
const cleanedSteps = steps.map(step => ({
  id: step.id,
  name: step.name,
  duration: step.duration,
  // ... EVERY field must be listed
  newField: step.newField || undefined, // Don't forget new fields!
}))
```

### 4. Store Patterns

#### Optimistic Updates
```typescript
// Update UI immediately
setTasks(updatedTasks)

// Then persist
try {
  await window.electronAPI.updateTask(id, updates)
} catch (error) {
  // Revert on failure
  setTasks(originalTasks)
}
```

#### Event-Driven Updates
```typescript
// Emit events for cross-component updates
appEvents.emit(EVENTS.TASK_UPDATED)

// Listen in affected components
useEffect(() => {
  const handler = () => loadTasks()
  appEvents.on(EVENTS.TASK_UPDATED, handler)
  return () => appEvents.off(EVENTS.TASK_UPDATED, handler)
}, [])
```

### 5. Database Service Patterns

#### Allowed Fields Pattern
```typescript
const allowedFields = [
  'name', 'duration', 'importance', // etc
]

const cleanData = Object.entries(rawData).reduce((acc, [key, value]) => {
  if (allowedFields.includes(key)) {
    acc[key] = value
  }
  return acc
}, {})
```

#### Format/Transform Pattern
```typescript
private formatTask(task: any): Task {
  return {
    ...task,
    dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
    deadline: task.deadline ?? null,
    // Transform database representation to app representation
  }
}
```

## Anti-Patterns to Avoid

### 1. Implicit Field Inclusion
```typescript
// BAD - Only includes known fields
const stepData = {
  name: step.name,
  duration: step.duration,
  // New fields get lost!
}

// GOOD - Explicit about all fields
const stepData = {
  name: step.name,
  duration: step.duration,
  importance: step.importance || undefined,
  urgency: step.urgency || undefined,
  // All fields explicitly handled
}
```

### 2. Destructuring Without Rest
```typescript
// BAD - Loses unknown fields
const { id, name, duration } = step

// GOOD - Preserves all fields
const { tempId, ...cleanStep } = step
```

### 3. Assuming Field Existence
```typescript
// BAD - Crashes if field missing
const priority = task.priority.toString()

// GOOD - Safe access
const priority = task.priority?.toString() || 'none'
```

## Testing Patterns

### Integration Test Template
```typescript
describe('Field Persistence', () => {
  it('should persist new field through entire stack', async () => {
    // 1. Create with field
    const entity = await create({ newField: 'value' })
    
    // 2. Verify immediate response
    expect(entity.newField).toBe('value')
    
    // 3. Retrieve fresh copy
    const saved = await get(entity.id)
    
    // 4. Verify persistence
    expect(saved.newField).toBe('value')
    
    // 5. Update field
    await update(entity.id, { newField: 'updated' })
    
    // 6. Verify update
    const updated = await get(entity.id)
    expect(updated.newField).toBe('updated')
  })
})
```

## Debugging Workflow

1. **Identify Layer**: Where does field get lost?
   - Use console.log at each layer
   - Check network tab for IPC calls
   - Query database directly

2. **Common Issues**:
   - Field not in Prisma schema → Run migration
   - Field not in allowedFields → Add to array
   - Field not in clean data → Add to mapping
   - Field not in TypeScript type → Update interface

3. **Verification**:
   ```bash
   # Check schema
   npx prisma studio
   
   # Check database directly
   sqlite3 dev.db ".schema TableName"
   
   # Check TypeScript
   npm run typecheck
   ```

## Migration Strategy

When adding new fields:

1. **Database First**: Add to Prisma, run migration
2. **Types Second**: Update TypeScript interfaces
3. **Backend Third**: Update database service
4. **Frontend Last**: Update UI components
5. **Test Everything**: Write integration test

## Event System

### Available Events
```typescript
export const EVENTS = {
  TASK_UPDATED: 'task-updated',
  TASK_DELETED: 'task-deleted',
  WORKFLOW_UPDATED: 'workflow-updated',
  TIME_LOGGED: 'time-logged',
  SESSION_CHANGED: 'session-changed',
}
```

### Event Pattern
```typescript
// Emit after changes
appEvents.emit(EVENTS.TASK_UPDATED, { id: task.id })

// Listen for changes
appEvents.on(EVENTS.TASK_UPDATED, (data) => {
  if (data.id === currentTask.id) {
    reloadTask()
  }
})
```

## Performance Considerations

### Batch Operations
```typescript
// BAD - N database calls
for (const step of steps) {
  await updateStep(step)
}

// GOOD - Single transaction
await updateAllSteps(steps)
```

### Selective Loading
```typescript
// Include related data only when needed
const task = await getTask(id, { 
  includeSteps: true,
  includeWorkSessions: false 
})
```

### Caching Pattern
```typescript
const cache = new Map()

async function getCached(id: string) {
  if (cache.has(id)) {
    return cache.get(id)
  }
  const data = await fetch(id)
  cache.set(id, data)
  return data
}
```

## Security Patterns

### Input Validation
```typescript
// Validate at UI layer
const isValid = name.length > 0 && duration > 0

// Validate at service layer
if (!isValidTaskData(data)) {
  throw new Error('Invalid task data')
}

// Validate at database layer (Prisma schema)
```

### SQL Injection Prevention
- Always use Prisma's parameterized queries
- Never construct SQL strings manually
- Validate and sanitize all inputs

## Maintenance

### Regular Audits
- Check for unused fields
- Remove deprecated patterns
- Update documentation

### Code Organization
- Group related operations
- Keep services focused
- Maintain clear separation of concerns