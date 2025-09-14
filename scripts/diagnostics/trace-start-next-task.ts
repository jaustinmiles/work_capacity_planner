#!/usr/bin/env npx tsx

console.log('=' .repeat(80))
console.log('TRACE: What happens when "Start Next Task" is clicked')
console.log('=' .repeat(80))

console.log(`
FLOW WHEN BUTTON IS CLICKED:

1. WorkStatusWidget.handleStartNextTask() is called
   ↓
2. Calls useTaskStore.getState().startNextTask()
   ↓
3. startNextTask() checks if work is already active
   - Calls getWorkTrackingService().isAnyWorkActive()
   - This checks the in-memory activeWorkSessions Map
   - NOT the database! So stale DB session doesn't block this
   ↓
4. Calls get().getNextScheduledItem()
   ↓
5. getNextScheduledItem() checks for currentSchedule
   - If none, calls generateSchedule()
   ↓
6. generateSchedule() calls schedulingService.createSchedule()
   ↓
7. createSchedule() calls unifiedAdapter.scheduleTasks()
   ↓
8. scheduleTasks() filters tasks by hasSteps
   - Removes 380min of 425min tasks!
   ↓
9. Calls scheduler.scheduleForDisplay()
   ↓
10. scheduleForDisplay() → allocateToWorkBlocks() → createBlockCapacity()
   ↓
11. createBlockCapacity() calls parseTimeOnDate(block.startTime)
   ↓
12. parseTimeOnDate() does timeStr.split(':')
    - But block.startTime is undefined!
    - 💥 CRASH: Cannot read properties of undefined

RESULT: 
- generateSchedule() fails
- getNextScheduledItem() returns null
- UI shows "No tasks available"

ROOT CAUSES:
1. ❌ Scheduler crashes on undefined.split()
2. ❌ hasSteps filters out 89% of tasks (380/425 min)
3. ⚠️ Stale DB session exists but doesn't affect this flow

TO FIX:
1. Must fix the undefined.split() crash
2. Must fix hasSteps filtering
3. Optionally clean up stale session
`)

main().catch(console.error)

async function main() {}
