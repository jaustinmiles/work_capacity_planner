# CLAUDE.md - STOP BEING A BAD ENGINEER

This file is your PRIMARY GUIDE to not being a terrible AI assistant. READ IT. FOLLOW IT. STOP MAKING THE SAME MISTAKES.

## 🚨 CRITICAL: STOP DOING THESE THINGS IMMEDIATELY

### 1. STOP CREATING NEW FILES
**BEFORE creating ANY new file, CHECK if it already exists:**
- `/docs/` - All documentation lives here
- `/TECH_DEBT.md` - Track ALL issues and TODOs here, NOT in new files
- `/docs/archive/CLEANUP_RECOMMENDATIONS.md` - Code quality issues
- Check existing files with: `find . -name "*issue*" -o -name "*todo*" -o -name "*plan*"`

### 2. STOP RUNNING SCRIPTS WITHOUT TESTING
**The $100 Lesson:** NEVER run a script on the entire codebase without testing first!
1. Test on 1-2 files first: `script.sh test-file.ts`
2. Verify the output is correct
3. Check for side effects (duplicate imports, broken syntax)
4. ONLY then apply to more files
5. COMMIT before running risky scripts

### 3. STOP IGNORING EXISTING PATTERNS
**Before implementing ANYTHING:**
1. Search for similar functionality: `grep -r "pattern" src/`
2. Check how it's already done in the codebase
3. Follow the existing pattern, don't create a new one
4. We already have 3 scheduling engines - DON'T CREATE A 4TH!

## 📁 CRITICAL FILE LOCATIONS - MEMORIZE THESE

### Documentation & Issues
- **Issues/TODOs**: `/TECH_DEBT.md` - ALL issues go here
- **Architecture**: `/docs/architecture.md` - System design
- **Known Issues**: Already in TECH_DEBT.md - DON'T CREATE known-issues.md!
- **Cleanup Tasks**: `/docs/archive/CLEANUP_RECOMMENDATIONS.md`
- **Project Spec**: `/docs/archive/electron-app-tech-spec.md`

### Code TODOs (already in the code!)
- Amendment TODOs: `src/renderer/utils/amendment-applicator.ts` (13 TODOs)
- Search for all: `grep -r "TODO\|FIXME" src/`

### Key Implementation Files
- **Database**: `/src/main/database.ts` - Single source of truth
- **Types**: `/src/shared/types.ts` - Core type definitions
- **Enums**: `/src/shared/enums.ts` - TaskType, TaskStatus, etc.
- **IPC Handlers**: `/src/main/index.ts` - All electron IPC
- **Amendments**: `/src/renderer/utils/amendment-applicator.ts`

## 🛑 DO NOT TOUCH WITHOUT PERMISSION
- `.eslintrc.js` - NEVER change linter config, fix the code instead
- `jest.config.js` - NEVER change test config, fix the tests instead
- `tsconfig.json` - NEVER weaken TypeScript settings
- Any migration scripts - They're done, leave them alone
- `/config/` directory - Configuration is FROZEN

## ✅ CORRECT WORKFLOW - FOLLOW EXACTLY

### 1. Before ANY Change
```bash
# Check current state
npm run typecheck  # MUST be 0 errors to start
npm run lint       # MUST be 0 errors to start
git status         # MUST be clean or committed
```

### 2. Research Phase (DO THIS FIRST!)
```bash
# Find existing implementations
grep -r "feature_name" src/
find . -name "*related*" -type f

# Check documentation
cat /TECH_DEBT.md | grep -A10 "issue_name"
ls -la docs/ | grep -i "feature"

# Check for TODOs
grep -r "TODO.*feature" src/
```

### 3. Implementation Phase
```bash
# Make changes incrementally
# After EACH file change:
npm run typecheck  # Fix immediately if broken
npm run lint       # Fix immediately if broken

# Test scripts on ONE file first
./script.sh single-test-file.ts
# Verify output
# THEN apply to more files
```

### 4. Before Marking Complete
```bash
# ALL of these MUST pass:
npm run typecheck      # 0 errors required
npm run lint           # 0 errors required
npm test -- --run      # All tests must pass
npm run build          # Must build successfully
```

## 🏗️ CURRENT PROJECT STATE

### What's Working
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors  
- ✅ Unified task model (Tasks + Workflows in same table)
- ✅ Voice amendments (partial - see issues)
- ✅ CI/CD Pipeline configured

### Known Issues (from TECH_DEBT.md)
1. **AI Amendment Dependency Editing** - Not working (just discovered)
2. **Workflow Step Operations** - Partially implemented:
   - ✅ Step addition via voice
   - ❌ Step status updates
   - ❌ Step time logging
   - ❌ Step removal
   - ❌ Dependency changes
3. **Multiple Scheduling Engines** - 3 different implementations exist
4. **Duplicate Logger Implementations** - Need consolidation
5. **WorkBlock Type Inconsistency** - Still uses string literals

### Active TODOs in Code
- 13 TODOs in `amendment-applicator.ts`
- 3 TODOs in `amendment-parser.ts`
- 1 TODO in `VoiceAmendmentModal.tsx`

## 🎯 DECISION TREE - USE THIS!

**Q: Should I create a new file?**
→ NO! Search for existing files first. Check TECH_DEBT.md.

**Q: Should I change ESLint/TypeScript config?**
→ NO! Fix the code to pass the existing rules.

**Q: Should I run a script on all files?**
→ NO! Test on 1-2 files first. Always.

**Q: Should I implement a new pattern?**
→ NO! Find and follow the existing pattern.

**Q: The user found a bug, where do I document it?**
→ Add to TECH_DEBT.md under "Remaining High Priority Issues"

**Q: Where do TODOs go?**
→ In the code as `// TODO:` comments, summarized in TECH_DEBT.md

## 🔍 COMMON SEARCHES - COPY & PASTE THESE

```bash
# Find all documentation
find docs -name "*.md" -type f

# Find all TODOs
grep -r "TODO\|FIXME\|HACK\|XXX" src/

# Find type definitions
grep -r "interface.*Task\|type.*Task" src/shared/

# Find existing implementations
grep -r "functionName\|feature" src/ --include="*.ts" --include="*.tsx"

# Check what changed recently
git log --oneline -20
git diff HEAD~5 --stat
```

## 📊 METRICS TO MAINTAIN

| Metric | Current | Required | Command |
|--------|---------|----------|---------|
| TypeScript Errors | 0 | 0 | `npm run typecheck` |
| ESLint Errors | 0 | 0 | `npm run lint` |
| Test Pass Rate | 100% | 100% | `npm test -- --run` |
| Build Success | ✅ | ✅ | `npm run build` |

## 🚫 YOUR REPEATED MISTAKES - STOP DOING THESE

1. **Creating duplicate files** - You just created known-issues.md when TECH_DEBT.md exists
2. **Not testing scripts** - You ran enum replacement on entire codebase without testing
3. **Not reading existing docs** - You don't know where things are documented
4. **Changing configs instead of code** - You try to weaken TypeScript/ESLint instead of fixing issues
5. **Not committing before risky operations** - You make massive changes without safety net
6. **Creating new patterns** - You make 3rd/4th implementations instead of unifying
7. **Not following explicit user requests** - User says don't create files, you create files

## 💡 WHEN STUCK

1. **First**: Check TECH_DEBT.md for known issues
2. **Second**: Search existing code for similar patterns
3. **Third**: Check `/docs/archive/` for historical context
4. **Fourth**: Look for TODOs in the specific file
5. **Last resort**: Ask user for clarification

## 🎖️ SUCCESS CRITERIA

You are successful when:
- Zero TypeScript errors after changes
- Zero ESLint errors after changes  
- No new files created unnecessarily
- Following existing patterns
- Testing before applying changes broadly
- User doesn't have to correct your approach

---

**REMEMBER**: The user is tired of fighting you. Read this file EVERY time before making decisions. The codebase already has structure - FOLLOW IT.