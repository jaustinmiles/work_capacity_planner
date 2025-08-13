# Beta Test Walkthrough

This document outlines the comprehensive user journey for testing the Work Capacity Planner application.

## Test Scenario: Complete Workflow from Schedule to Task Execution

### Phase 1: Schedule Setup
1. **Voice Schedule Recording**
   - Start voice recording for schedule and time availability
   - Describe work blocks, meetings, and available time slots
   - **Verify**: Sleep blocks should be auto-generated from voice input
   
2. **Schedule Review & Edit**
   - Review the generated schedule
   - Make any necessary edits to time blocks
   - Add missing blocks (e.g., sleep if not auto-generated)
   - **TODO**: Test schedule creation for multiple days

### Phase 2: Context & Task Creation
3. **Job Context Setup**
   - Open AI brainstorm modal
   - Record job context via voice
   - **Future Feature**: Separate permanent vs day-to-day context
   
4. **Jargon Dictionary**
   - Review auto-populated technical terms (via AI extraction)
   - Fill in definitions for identified jargon
   - Add any missing terms manually
   
5. **Task Brainstorming**
   - Record all todos and tasks on your mind
   - Use voice input for natural task description
   
6. **AI Task Review**
   - Review AI-generated tasks and workflows
   - Check for accuracy and completeness
   - **Future Feature**: Answer AI questions in dialogue box for task refinement

### Phase 3: Task Management
7. **Task Approval**
   - Approve and create the generated tasks
   - Verify tasks are saved to database
   
8. **Workflow Management**
   - Navigate to workflow view
   - Click through each workflow
   
9. **Workflow Refinement** (for each workflow)
   - View dependency graph
   - Make dependency edits as needed
   - Add missing tasks
   - Adjust time estimates
   
10. **Schedule Optimization**
    - View Gantt chart
    - Make priority adjustments
    - **Future Feature**: Adjust priority directly from Gantt chart
    - **Future Feature**: Click tasks to navigate to edit view

### Phase 4: Execution & Tracking
11. **Work Simulation**
    - Mark some tasks as completed
    - Log time for completed work
    - Update task progress
    
12. **Dynamic Scheduling**
    - Add new tasks
    - Observe how they interleave with existing tasks
    - Verify smart scheduling algorithm
    
13. **Views Verification**
    - Check Calendar view for scheduled tasks
    - Review task queue for priority order
    
14. **Voice Features** (Future)
    - Test voice input for work logging
    - Try voice commands for workflow modifications

## Known Issues & Status

### ✅ Fixed Issues
- Task creation bug (missing updatedAt field)
- Message import error in BrainstormModal
- Database protection verified (backups exist)

### ⚠️ Current Issues
- WebM audio files require conversion to m4a
- No error messages for unsupported file formats (silent failure)
- Sleep blocks not auto-generating from voice

### 🚀 Upcoming Features
- Personal life tasks (separate from work tasks)
- Permanent vs temporary job context
- Interactive Q&A for task clarification
- Gantt chart priority editing
- Voice-based work logging

## Test Coverage Progress

| Step | Feature | Status | Notes |
|------|---------|--------|-------|
| 1-2 | Schedule Creation | ✅ Partial | Sleep blocks need fix |
| 3-5 | Context & Brainstorming | ✅ Working | Jargon extraction added |
| 6-7 | Task Generation | ✅ Working | Type validation needed |
| 8-10 | Workflow Management | ✅ Working | Graph editing functional |
| 11-12 | Time Tracking | ⏳ Testing | Not fully verified |
| 13-14 | Views & Voice | 🔄 In Progress | Voice features planned |

## Success Criteria

- [ ] Complete workflow from voice input to task execution
- [ ] All tasks save correctly to database
- [ ] Schedule respects time constraints
- [ ] Workflows handle dependencies properly
- [ ] Time tracking accurately records work
- [ ] UI provides clear feedback for all actions
- [ ] No silent failures or unclear errors

## Testing Notes

- Audio recordings are preserved in `/tmp/work-planner-audio/`
- Database backups exist in `/backups/` folder
- Use development mode for verbose logging
- Check browser console for client-side errors
- Check terminal for server-side errors