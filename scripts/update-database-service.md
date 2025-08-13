# Database Service Update Plan

## Changes Required in src/main/database.ts

### 1. Remove Import
```typescript
// REMOVE: import { SequencedTask } from '../shared/sequencing-types'
```

### 2. Update Methods to Remove

These methods should be DELETED entirely:
- `getSequencedTasks()` - Replace with `getTasks()` filtered by hasSteps
- `getSequencedTaskById()` - Replace with `getTaskById()` 
- `createSequencedTask()` - Replace with `createTask()` with hasSteps=true
- `updateSequencedTask()` - Replace with `updateTask()`
- `deleteSequencedTask()` - Replace with `deleteTask()`
- `formatSequencedTask()` - Not needed, use `formatTask()`
- `deleteAllSequencedTasks()` - Replace with `deleteAllTasks()` filtered

### 3. Update getTasks() Method

Current getTasks() needs to include steps for workflows:
```typescript
async getTasks(): Promise<Task[]> {
  const sessionId = await this.getActiveSession()
  const tasks = await this.client.task.findMany({
    where: { sessionId },
    include: {
      TaskStep: true, // Include steps for workflows
    },
    orderBy: { createdAt: 'desc' },
  })
  
  return tasks.map(task => ({
    ...task,
    dependencies: JSON.parse(task.dependencies),
    steps: task.hasSteps ? task.TaskStep.map(step => ({
      ...step,
      dependsOn: JSON.parse(step.dependsOn),
    })) : undefined,
  }))
}
```

### 4. Update createTask() Method

Must handle creating steps when hasSteps=true:
```typescript
async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
  const sessionId = await this.getActiveSession()
  
  // Extract steps if present
  const { steps, ...taskDataWithoutSteps } = taskData
  
  const task = await this.client.task.create({
    data: {
      ...taskDataWithoutSteps,
      sessionId,
      dependencies: JSON.stringify(taskData.dependencies),
      hasSteps: !!steps && steps.length > 0,
    },
  })
  
  // Create steps if this is a workflow
  if (steps && steps.length > 0) {
    await this.client.taskStep.createMany({
      data: steps.map((step, index) => ({
        ...step,
        taskId: task.id,
        stepIndex: index,
        dependsOn: JSON.stringify(step.dependsOn || []),
      })),
    })
    
    // Return task with steps
    const taskWithSteps = await this.client.task.findUnique({
      where: { id: task.id },
      include: { TaskStep: true },
    })
    
    return this.formatTask(taskWithSteps!)
  }
  
  return this.formatTask(task)
}
```

### 5. Update Store References

In `src/renderer/store/useTaskStore.ts`:
- Remove `sequencedTasks` state
- Remove all methods that use `sequencedTasks`
- Update to use unified `tasks` array filtered by `hasSteps`

### 6. Update IPC Handlers

In `src/main/index.ts` (or wherever IPC handlers are):
- Remove all `sequencedTask` channels
- Update to use unified task channels

## Migration Steps

1. **Backup first**: Already done ✅
2. **Update database.ts**: Remove all SequencedTask methods
3. **Update store**: Remove sequencedTasks state
4. **Update components**: Use unified task model
5. **Test thoroughly**: Ensure workflows still work
6. **Run typecheck**: Should see significant error reduction