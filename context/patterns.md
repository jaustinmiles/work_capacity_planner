# Essential Code Patterns

## React Patterns

### Stable Keys (No Random Values)
```typescript
// ❌ BAD: Breaks reconciliation
rowKey={() => Math.random()}

// ✅ GOOD: Stable unique keys
rowKey={(record) => `${record.id}-${record.timestamp}`}
```

### Defensive Container Sizing
```typescript
// Prevent collapse during initialization
<Card style={{ minHeight: 600 }}>
  <div ref={containerRef} style={{ minHeight: 500 }}>
```

## Data Flow

### IPC Communication
```typescript
// Renderer → Main
const result = await window.api.invoke('save-task', task)

// Main → Renderer
window.api.send('task-updated', task)
```

### JSON Field Handling
```typescript
// From database
const steps = task.steps ? JSON.parse(task.steps) : []

// To database
await prisma.task.update({
  data: { steps: JSON.stringify(steps) }
})
```

## Core Utilities

### ID Generation
```typescript
import { generateUniqueId } from '../shared/utils/step-id-utils'
const id = generateUniqueId() // timestamp-based
```

### Time Operations
```typescript
import { getCurrentTime } from '../shared/time-provider'
const now = getCurrentTime() // NOT Date.now()
```

### Colors
```typescript
import { getTypeColor } from '../shared/colors'
const color = getTypeColor(TaskType.Focused)
```

### Logging
```typescript
import { logger } from '../shared/utils/logger'
logger.ui.info('UI event', { data })
logger.system.error('System error', error)
```

## Store Pattern
```typescript
// Optimistic update
store.updateTask(tempTask)
const saved = await api.saveTask(tempTask)
store.updateTask(saved) // Replace with server version
```

## Event System
```typescript
import { appEvents, EVENTS } from '../shared/app-events'

// Emit
appEvents.emit(EVENTS.TASK_UPDATED, { id })

// Listen
useEffect(() => {
  const handler = () => reload()
  appEvents.on(EVENTS.TASK_UPDATED, handler)
  return () => appEvents.off(EVENTS.TASK_UPDATED, handler)
}, [])
```

## Testing

### Mock Time
```typescript
import { setMockTime, resetMockTime } from '../shared/time-provider'

beforeEach(() => {
  setMockTime(new Date('2025-01-15T10:00:00'))
})

afterEach(() => {
  resetMockTime()
})
```

## Common Gotchas

### Always Include All Fields
```typescript
// ❌ BAD: Loses new fields
const step = { name: step.name, duration: step.duration }

// ✅ GOOD: Preserves all fields
const { tempId, ...cleanStep } = step
```

### Safe Property Access
```typescript
// ❌ BAD: Crashes if missing
const value = obj.nested.property

// ✅ GOOD: Safe access
const value = obj?.nested?.property ?? defaultValue
```