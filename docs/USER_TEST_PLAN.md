# Comprehensive User Test Plan for Task Planner
*Version 1.0 - Updated August 2025*

## Purpose
This test plan ensures all features are working correctly and provides a consistent testing workflow that can be repeated for each release. Following this plan will help identify bugs and ensure the application meets user needs.

## Pre-Test Setup
1. Clear all data (Dev Tools → Clear Data)
2. Create a new session
3. Have feedback form ready (Dev Tools → Feedback)

---

## Phase 1: Schedule Creation & Management

### 1.1 Voice-Based Schedule Creation
- [ ] Navigate to Schedule Generator
- [ ] Record voice description: "I work 9 to 5 on weekdays with a lunch break from 12 to 1. I have focus time in the morning from 9 to 12 and admin time in the afternoon from 1 to 5. On weekends I want personal time from 10am to 2pm."
- [ ] Verify AI generates correct schedule
- [ ] Review proposed blocks
- [ ] Save schedule

### 1.2 Manual Schedule Creation
- [ ] Navigate to Multi-Day Schedule Editor  
- [ ] Create Monday schedule:
  - [ ] Add focused block (6:00 AM - 9:00 AM)
  - [ ] Add admin block (9:00 AM - 10:30 AM)
  - [ ] Add break/meeting (10:30 AM - 11:00 AM)
  - [ ] Add flexible block (11:00 AM - 12:30 PM)
  - [ ] Add lunch (12:30 PM - 1:30 PM)
  - [ ] Add focused block (1:30 PM - 4:00 PM)
  - [ ] Add personal block (4:00 PM - 6:00 PM)
- [ ] Test drag-and-drop to reorder blocks
- [ ] Test resize handles to adjust duration

### 1.3 Schedule Templates
- [ ] Copy Monday schedule to all weekdays
- [ ] Create different weekend schedule:
  - [ ] Add personal blocks (9:00 AM - 12:00 PM)
  - [ ] Add flexible blocks (12:00 PM - 3:00 PM)
- [ ] Apply to both Saturday and Sunday
- [ ] Verify all days show correctly in calendar view

---

## Phase 2: Task & Workflow Creation

### 2.1 Voice Task Creation
- [ ] Open AI Brainstorm Modal
- [ ] Record: "I need to complete a code review that will take 2 hours, write documentation for 90 minutes, attend a team meeting for 1 hour, and fix three bugs which should take 30 minutes each"
- [ ] Add jargon dictionary entries if needed
- [ ] Review generated tasks
- [ ] Adjust priorities/durations if needed
- [ ] Accept and create tasks

### 2.2 Manual Task Creation
- [ ] Create individual tasks:
  - [ ] Focused task: "Deep work session" (3 hours, importance: 9, urgency: 7)
  - [ ] Admin task: "Email responses" (45 minutes, importance: 5, urgency: 8)
  - [ ] Personal task: "Exercise" (1 hour, importance: 8, urgency: 6)
- [ ] Set cognitive complexity for each (1-5 scale)
- [ ] Add deadlines to 2 tasks
- [ ] Add notes to at least 1 task

### 2.3 Workflow Creation
- [ ] Create a workflow: "Product Launch"
- [ ] Add steps:
  1. [ ] Research competitors (2 hours, focused)
  2. [ ] Create feature list (1 hour, focused, depends on step 1)
  3. [ ] Design mockups (3 hours, focused, depends on step 2)
  4. [ ] Review with team (1 hour, admin, 2 hours async wait)
  5. [ ] Implement changes (2 hours, focused, depends on step 4)
  6. [ ] Final testing (1 hour, admin, depends on step 5)
- [ ] Set workflow priority (importance: 8, urgency: 9)
- [ ] Set workflow deadline
- [ ] Override priority for "Review with team" step (urgency: 10)
- [ ] View dependency graph
- [ ] Save workflow

---

## Phase 3: Scheduling & Priority Management

### 3.1 Schedule Generation
- [ ] Navigate to Timeline/Gantt Chart
- [ ] Verify tasks are scheduled according to priority
- [ ] Check that:
  - [ ] High complexity tasks are in morning focused blocks
  - [ ] Admin tasks are in admin blocks
  - [ ] Personal tasks are in personal blocks
  - [ ] Deadlines are respected
  - [ ] Dependencies are maintained

### 3.2 Eisenhower Matrix
- [ ] View Eisenhower Matrix
- [ ] Verify tasks are correctly categorized:
  - [ ] Do First (Important & Urgent)
  - [ ] Schedule (Important & Not Urgent)
  - [ ] Delegate (Not Important & Urgent)
  - [ ] Eliminate (Not Important & Not Urgent)
- [ ] Click on tasks to view details
- [ ] Test zoom controls

### 3.3 Manual Schedule Adjustments
- [ ] Drag tasks in Gantt chart to different times
- [ ] Split a long task across multiple blocks
- [ ] Set a task deadline by right-clicking
- [ ] Lock a task to specific time

---

## Phase 4: Work Logging & Time Tracking

### 4.1 Dual View Work Logger
- [ ] Open Work Logger Dual View
- [ ] View both timeline and circular clock
- [ ] Create work session by dragging on timeline
- [ ] Create another session by dragging on clock
- [ ] Verify sessions sync between views
- [ ] Assign sessions to tasks
- [ ] Test overlap detection

### 4.2 Workflow Progress Tracking
- [ ] Navigate to workflow created earlier
- [ ] Start work on first step
- [ ] Log 30 minutes of work
- [ ] Mark step as 50% complete
- [ ] Complete the step
- [ ] Verify progress updates in workflow view
- [ ] Check that dependent steps become available

### 4.3 Quick Time Logging
- [ ] From task list, click clock icon on a task
- [ ] Log time using quick buttons (15m, 30m, 1h, 2h)
- [ ] Add notes about work done
- [ ] Save and verify time is tracked

### 4.4 Work Sessions Review
- [ ] Click on logged time tag to view sessions
- [ ] Edit a session duration
- [ ] Delete a test session
- [ ] Verify totals update correctly

---

## Phase 5: Voice Amendments & Updates

### 5.1 Task Amendments
- [ ] Select a task or workflow
- [ ] Open Voice Amendment Modal
- [ ] Record: "I finished the first step but it took 3 hours instead of 2. The second step is blocked waiting for approval."
- [ ] Review proposed changes
- [ ] Apply amendments
- [ ] Verify updates applied correctly

### 5.2 Context and Jargon
- [ ] Add context to amendment
- [ ] Update jargon dictionary
- [ ] Test that jargon persists across sessions

---

## Phase 6: Analytics & Insights

### 6.1 Work Status Widget
- [ ] Check sidebar widget shows:
  - [ ] Today's planned capacity
  - [ ] Current work block
  - [ ] Progress bars for focus/admin/personal
  - [ ] Total logged time
  - [ ] Remaining capacity

### 6.2 Time Accuracy
- [ ] Compare estimated vs actual time for completed tasks
- [ ] View which types of tasks you over/underestimate
- [ ] Check insights and recommendations

### 6.3 Calendar View
- [ ] Navigate to Calendar
- [ ] Verify weekly view shows all scheduled items
- [ ] Check that completed items show differently
- [ ] Test navigation between weeks

---

## Phase 7: Advanced Features

### 7.1 Cognitive Complexity Matching
- [ ] Create tasks with different complexity levels
- [ ] Set circadian rhythm preferences (bedtime)
- [ ] Verify complex tasks scheduled during peak hours
- [ ] Simple tasks scheduled during low-energy times

### 7.2 Async Task Handling
- [ ] Create task with async wait time
- [ ] Verify scheduler accounts for wait time
- [ ] Check that dependent tasks are scheduled appropriately

### 7.3 Session Management
- [ ] Create new session with different parameters
- [ ] Switch between sessions
- [ ] Verify data isolation between sessions

### 7.4 Periodic Tasks (if implemented)
- [ ] Create recurring task (e.g., "Check email every 2 hours")
- [ ] Verify appears multiple times in schedule
- [ ] Test completion of individual instances

---

## Phase 8: UI/UX Testing

### 8.1 Responsive Design
- [ ] Test window resizing
- [ ] Test fullscreen mode
- [ ] Verify all modals are accessible
- [ ] Check scrolling in long lists

### 8.2 Keyboard Navigation
- [ ] Tab through interface
- [ ] Use arrow keys in lists
- [ ] Test escape to close modals
- [ ] Test enter to submit forms

### 8.3 Error Handling
- [ ] Try to create task without required fields
- [ ] Enter invalid date/time values
- [ ] Test with no internet (for AI features)
- [ ] Verify error messages are helpful

---

## Phase 9: Data Management

### 9.1 Export/Import
- [ ] Export current schedule
- [ ] Export task list
- [ ] Clear data
- [ ] Import previously exported data
- [ ] Verify integrity

### 9.2 Feedback System
- [ ] Submit bug report via feedback form
- [ ] Submit feature request
- [ ] View submitted feedback
- [ ] Mark feedback as resolved

---

## Phase 10: Edge Cases

### 10.1 Stress Testing
- [ ] Create 50+ tasks
- [ ] Create workflow with 20+ steps
- [ ] Schedule tasks 3 months out
- [ ] Log 10+ work sessions in one day

### 10.2 Conflict Resolution
- [ ] Create overlapping meetings
- [ ] Create circular dependencies
- [ ] Set impossible deadlines
- [ ] Verify appropriate warnings/handling

### 10.3 Recovery Testing
- [ ] Close app during work session
- [ ] Reopen and verify session resumed
- [ ] Check unsaved changes handling

---

## Post-Test Actions

1. **Document Issues Found**
   - Use feedback form for each issue
   - Include reproduction steps
   - Note severity (critical/high/medium/low)
   - Attach screenshots if helpful

2. **Performance Notes**
   - Note any slow operations
   - Report UI lag or freezing
   - Document memory usage issues

3. **Usability Observations**
   - Confusing UI elements
   - Missing features
   - Workflow improvements
   - Accessibility issues

---

## Test Scenarios

### Scenario A: Daily Planning
1. Review today's schedule
2. Add 3 new urgent tasks
3. Reorganize schedule
4. Start working and log time
5. Handle interruptions (new urgent task)
6. End of day review

### Scenario B: Project Planning
1. Create multi-step project workflow
2. Set realistic deadlines
3. Assign cognitive complexity
4. Schedule across multiple days
5. Track progress daily
6. Adjust based on actual time

### Scenario C: Week Review
1. Review completed tasks
2. Analyze time accuracy
3. Identify patterns
4. Adjust future estimates
5. Plan next week

---

## Success Criteria

The test is considered successful if:
- [ ] All core features are functional
- [ ] No data loss occurs
- [ ] UI remains responsive
- [ ] Error messages are clear
- [ ] Workflow is intuitive
- [ ] Time tracking is accurate
- [ ] Schedule respects constraints
- [ ] Voice features work reliably

---

## Notes Section
*Use this space to document observations, suggestions, and ideas during testing*

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________