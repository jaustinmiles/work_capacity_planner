# Guide: Adding New Database Fields

## Overview
This guide documents the complete process for adding new fields to database entities. Following this checklist prevents persistence issues and ensures fields work end-to-end.

## Complete Checklist for Adding a New Field

### 1. Database Schema (Prisma)
- [ ] Add field to `prisma/schema.prisma`
- [ ] Run `npx prisma migrate dev --name describe_your_change`
- [ ] Verify migration created in `prisma/migrations/`

### 2. TypeScript Types
- [ ] Update interface in `/src/shared/types.ts`
- [ ] Add field with correct type and optionality (`?` for optional)
- [ ] Update any related types that extend or use this interface

### 3. Database Service (`/src/main/database.ts`)

#### For Task Fields:
- [ ] Add field name to `allowedFields` array in `updateTask()` method
- [ ] Handle special serialization if needed (e.g., JSON.stringify for arrays)
- [ ] Update `formatTask()` method if field needs transformation

#### For Step Fields:
- [ ] Add field to `stepData` object in `updateTask()` method where steps are updated
- [ ] Ensure field is included in both CREATE and UPDATE operations
- [ ] Handle null/undefined appropriately

### 4. Frontend Components

#### Form/Edit Components:
- [ ] Add form field to edit modal
- [ ] Add field to form state initialization
- [ ] Include field in save/submit handler
- [ ] **CRITICAL**: Include field when cleaning/preparing data for save

#### Display Components:
- [ ] Add field display in view mode
- [ ] Add appropriate formatting/rendering
- [ ] Consider adding to tooltips or detail views

### 5. State Management

#### Store Updates:
- [ ] Ensure field is passed through store update methods
- [ ] Verify field isn't filtered out anywhere in the chain

#### Component State:
- [ ] Initialize field in useState/default values
- [ ] Include in all setState operations

### 6. Testing

#### Integration Test:
- [ ] Create test that saves entity with new field
- [ ] Retrieve entity and verify field persisted
- [ ] Test null/undefined handling
- [ ] Test field updates

#### UI Test:
- [ ] Manual test: Create entity with field value
- [ ] Manual test: Update field value
- [ ] Manual test: Clear field value
- [ ] Verify persistence across page reloads

## Common Pitfalls

### 1. The "Clean Data" Trap
**Problem**: Fields get filtered out when preparing data for save
```typescript
// BAD - field gets lost
const cleanedSteps = steps.map(step => ({
  id: step.id,
  name: step.name,
  duration: step.duration,
  // newField is missing!
}))

// GOOD - field included
const cleanedSteps = steps.map(step => ({
  id: step.id,
  name: step.name, 
  duration: step.duration,
  newField: step.newField || undefined,
}))
```

### 2. The "Allowed Fields" Filter
**Problem**: Database service filters out fields not in allowedFields
```typescript
// In database.ts updateTask()
const allowedFields = [
  'name', 'duration', 'importance',
  // 'newField' missing - will be filtered out!
]
```

### 3. The "Type Mismatch" Issue
**Problem**: Field type in Prisma doesn't match TypeScript type
```prisma
// Prisma schema
model Task {
  priority Int? // nullable integer
}

// TypeScript
interface Task {
  priority: string // wrong type!
}
```

### 4. The "Missing Migration" Problem
**Problem**: Field added to TypeScript but not database
- Always run migration FIRST
- Then update TypeScript types

## Example: Adding Priority to Workflow Steps

### Step 1: Prisma Schema
```prisma
model TaskStep {
  // ... existing fields
  importance Int? // 1-10, optional override
  urgency    Int? // 1-10, optional override
}
```

### Step 2: Run Migration
```bash
npx prisma migrate dev --name add_step_priority_fields
```

### Step 3: TypeScript Types
```typescript
// src/shared/types.ts
export interface TaskStep {
  // ... existing fields
  importance?: number // 1-10, optional override
  urgency?: number    // 1-10, optional override
}
```

### Step 4: Database Service
```typescript
// src/main/database.ts - in updateTask()
const stepData = {
  // ... existing fields
  importance: step.importance || null,
  urgency: step.urgency || null,
}
```

### Step 5: UI Component
```typescript
// src/renderer/components/tasks/SequencedTaskEdit.tsx
// In handleSave():
const cleanedSteps = editingSteps.map(step => ({
  // ... existing fields
  importance: step.importance || undefined,
  urgency: step.urgency || undefined,
}))

// In form:
<FormItem label="Importance" field="importance">
  <InputNumber min={1} max={10} />
</FormItem>
```

### Step 6: Integration Test
```typescript
it('should persist step priority fields', async () => {
  const task = await db.createTask({
    // ... task data
    steps: [{
      // ... step data
      importance: 9,
      urgency: 8,
    }]
  })
  
  const saved = await db.getTask(task.id)
  expect(saved.steps[0].importance).toBe(9)
  expect(saved.steps[0].urgency).toBe(8)
})
```

## Debugging Checklist

If a field isn't persisting:

1. **Check Browser DevTools Network Tab**
   - Is field in request payload?
   - If NO → Issue in frontend component
   - If YES → Issue in backend

2. **Add Console Logs**
   ```typescript
   // Before save
   console.log('Saving step with priority:', step.importance, step.urgency)
   
   // In database service
   console.log('Received step data:', stepData)
   
   // After retrieval
   console.log('Retrieved step:', savedStep)
   ```

3. **Check Database Directly**
   ```bash
   # Open database
   sqlite3 dev.db
   
   # Check schema
   .schema TaskStep
   
   # Query data
   SELECT importance, urgency FROM TaskStep WHERE id = 'your-step-id';
   ```

4. **Verify Each Layer**
   - UI Form → Component State → Store → IPC → Database Service → Prisma → SQLite

## Testing Strategy

### Unit Tests
- Test each layer independently
- Mock dependencies

### Integration Tests
- Test full flow from UI to database
- Use real database (test instance)
- Clean up after each test

### E2E Tests
- Test user workflow
- Verify field appears in UI
- Verify persistence after reload

## Maintenance

### Regular Audits
- Review this checklist quarterly
- Update with new patterns
- Add new common pitfalls

### Code Reviews
- Use this as review checklist
- Require test for new fields
- Verify all steps completed