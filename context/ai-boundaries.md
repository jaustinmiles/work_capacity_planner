# AI Assistant Authority Boundaries

## Purpose
This document defines the explicit boundaries of what the Claude Code assistant can and cannot do autonomously. Created in response to violations that occurred during development sessions.

## AUTONOMOUS ACTIONS (No permission needed)

### Development Work
- Write code for approved features within established plan
- Run quality checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- Add comprehensive logging to existing code and new features
- Fix obvious bugs with clear, well-understood solutions
- Refactor code while maintaining existing behavior
- Create and update test files to improve coverage

### Documentation & Analysis
- Update project documentation for completed work
- Search and analyze the codebase for understanding
- Read files to understand context and requirements
- Update context files (state.md, insights.md, decisions.md) with session progress
- Create analysis reports and technical documentation

### Git Operations (Limited)
- Commit code changes to feature branches with clear messages
- Push commits to feature branches (regular push, not force)
- Create new feature branches from main
- Add and stage files for commits

## USER APPROVAL REQUIRED

### Repository Management
- **Merge or close PRs** - User must merge via GitHub button interface
- **Force push or rewrite git history** - Always ask before using --force flags
- **Delete branches** - User manages branch lifecycle and cleanup
- **Create PRs** - Ask for permission and direction before creating

### Significant Changes
- **Make architectural decisions** - Changes affecting app structure or patterns
- **Modify configuration files** - package.json scripts, tsconfig, eslint config changes
- **Create database migrations** - Schema changes require careful consideration
- **Delete or significantly modify tests** - Only skip tests with TECH_DEBT.md notes
- **Bypass safety infrastructure** - Never use --no-verify or similar bypass flags

### Ambiguous Situations
- **Any action when user intent is unclear** - Better to ask than assume
- **Major refactoring decisions** - File organization, component restructuring
- **Performance optimizations** - Changes that affect how the app works
- **Feature scope changes** - Expanding beyond original requirements

## LOGGING-FIRST DEVELOPMENT RULE

### Mandatory Logging Requirements
- **ALL new features** must include comprehensive logging before being marked complete
- **Cannot mark feature "done"** until logging is verified to work correctly
- **Must be able to trace feature behavior** through logs when debugging
- **Debug, info, and warn levels** must be used appropriately throughout feature

### Logging Verification Process
1. Implement feature with extensive logging at all key points
2. Test that logging appears correctly when feature is used
3. Verify log messages are helpful for debugging
4. Only THEN mark feature as complete

### Examples of Required Logging
```typescript
// Feature initialization
logger.ui.info('🏗️ [FEATURE] Starting feature initialization', { context })

// Key operations
logger.ui.info('📋 [FEATURE] Processing data', { inputData, processingOptions })

// Decisions and branches
logger.ui.debug('🔍 [FEATURE] Checking conditions', { conditions, result })

// Problems and violations
logger.ui.warn('🚨 [FEATURE] Issue detected', { issue, impact, mitigation })

// Completion and results
logger.ui.info('✅ [FEATURE] Operation complete', { results, performance })
```

## QUALITY GATES

### Before Any Commit
- TypeScript: 0 errors required
- ESLint: 0 errors required (warnings in scripts/ acceptable)
- Tests: All must pass
- Build: Must succeed without errors

### Before Any Push
- All quality gates pass
- Commit messages are clear and descriptive
- Changes align with approved plan or requirements
- Logging is comprehensive for new features

### Before Marking Work Complete
- Feature works as specified
- Logging allows full traceability
- Tests cover the implementation
- Documentation updated appropriately
- User can verify the work meets requirements

## COMMUNICATION PROTOCOL

### When to Ask for Clarification
- User request is ambiguous or could have multiple interpretations
- Technical approach has multiple viable options
- Feature scope could be interpreted differently
- Any action that affects main branch or repository settings
- When encountering unexpected issues or blockers

### How to Ask Effectively
- Present the options you see
- Explain the tradeoffs of each approach
- Ask specific questions rather than general "what should I do?"
- Include relevant context from your analysis
- Propose your recommended approach with reasoning

## STRIKE SYSTEM AWARENESS

### Understanding Strikes
- **Strike 1**: Misunderstanding user requirements
- **Strike 2**: Shipping incomplete features (missing logging/verification)  
- **Strike 3**: Attempting actions beyond AI authority

### Strike Prevention
- Read user requests carefully and ask for clarification when needed
- Always implement comprehensive logging for new features
- Respect authority boundaries - ask before major actions
- Follow established protocols rather than assuming shortcuts

### Recovery from Violations
1. Acknowledge the specific violation clearly
2. Identify which boundary or protocol was crossed
3. Propose documentation improvements to prevent recurrence
4. Demonstrate understanding through corrective actions
5. Wait for explicit permission to continue

## DECISION TREE FOR COMMON SCENARIOS

### "Fix this bug"
- ✅ Analyze and implement fix if cause is clear
- 🤔 Ask for guidance if multiple approaches possible
- 🚫 Don't guess at user requirements if bug report is vague

### "Add this feature"  
- ✅ Implement with comprehensive logging if requirements are clear
- 🤔 Ask about scope and priorities if feature is complex
- 🚫 Don't mark complete until logging is verified

### "Push the changes"
- ✅ Regular push to feature branch
- 🤔 Ask about force push if history needs rewriting
- 🚫 Never merge the PR automatically

### "Close this PR"
- ✅ Ask for clarification about merge vs. close vs. abandon
- 🚫 Never take PR lifecycle actions without explicit instruction

This boundary specification aims to eliminate the ambiguity that led to previous violations while maintaining productive development flow.