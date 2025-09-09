# Logging Architecture Documentation

**Purpose**: Document the multiple logger implementations and their intended usage to prevent confusion about which logger to use where.

**Created**: 2025-09-09 during PR #67 cleanup  
**Status**: DOCUMENTATION FOR EXISTING IMPLEMENTATIONS

---

## 📊 Current Logger Implementations

### 1. Shared Logger (`src/shared/logger.ts`) - RECOMMENDED
**Status**: ✅ ACTIVE - Primary logger for application code  
**Usage**: Import this in most application code  
**Features**:
- Works in both main and renderer processes
- Structured logging with categories
- Ring buffer for debugging
- Database error persistence

```typescript
import { logger } from '@shared/logger'

logger.info('General message')
logger.error('Error message')
logger.workflow.info('Workflow-specific message')
logger.scheduler.debug('Scheduling debug info')
```

### 2. Renderer Logger (`src/renderer/utils/logger.ts`) - LEGACY
**Status**: ⚠️ LEGACY - Still used by some components  
**Usage**: Older renderer components use this  
**Migration**: Should be replaced with shared logger

```typescript
import { logger } from '../../utils/logger'
```

### 3. Main Process Logger (`src/logging/main/MainLogger.ts`) - SPECIALIZED
**Status**: ✅ ACTIVE - For main process only  
**Usage**: Database operations, IPC handlers in main process  
**Features**:
- File system logging
- Main process specific formatting
- Error persistence to database

### 4. Structured Logger (`src/logging/core/StructuredLogger.ts`) - FOUNDATION
**Status**: ✅ ACTIVE - Foundation class  
**Usage**: Base class for other loggers  
**Features**:
- Structured message formatting
- Category-based organization
- Ring buffer management

### 5. Browser Logger (`src/logging/renderer/BrowserLogger.ts`) - SPECIALIZED  
**Status**: ✅ ACTIVE - Browser-specific features  
**Usage**: Renderer process logging with browser-specific features  
**Features**:
- Browser console integration
- DOM-specific error handling
- Performance timing

### 6. Renderer Logger (`src/logging/renderer/RendererLogger.ts`) - PROCESS-SPECIFIC
**Status**: ✅ ACTIVE - Renderer process logging  
**Usage**: Renderer process with IPC communication to main  
**Features**:
- IPC forwarding to main process
- Ring buffer for debugging
- Process-specific message formatting

---

## 🎯 USAGE GUIDELINES

### Which Logger Should I Use?

| Context | Recommended Logger | Import Path |
|---------|-------------------|-------------|
| **Application Code (Most Common)** | Shared Logger | `import { logger } from '@shared/logger'` |
| **Main Process Database/IPC** | Main Logger | `import { logger } from '../logging/main/MainLogger'` |
| **Renderer Components (New)** | Shared Logger | `import { logger } from '@shared/logger'` |
| **Renderer Components (Legacy)** | Renderer Utils | `import { logger } from '../../utils/logger'` |
| **Scripts Directory** | Console.log | Scripts are allowed to use console.log directly |

### Logger Categories Available:

```typescript
logger.info()           // General information
logger.error()          // Errors and exceptions  
logger.warn()           // Warnings
logger.debug()          // Debug information
logger.workflow.info()  // Workflow-specific logs
logger.scheduler.info() // Scheduler-specific logs
logger.ui.info()        // UI interaction logs
logger.database.info()  // Database operation logs
```

---

## 🔄 MIGRATION PLAN

### Phase 1: Documentation (COMPLETED)
- ✅ Document all existing logger implementations
- ✅ Create usage guidelines  
- ✅ Identify which components use which loggers

### Phase 2: Standardization (FUTURE)
1. **Audit Usage**: Find all logger imports across codebase
2. **Migration Plan**: Create systematic migration to shared logger
3. **Deprecation Notices**: Mark legacy loggers as deprecated
4. **Component Migration**: Update components one by one
5. **Cleanup**: Remove unused logger implementations

### Phase 3: Consolidation (FUTURE)  
1. **Single Logger**: Consolidate to shared logger only
2. **Process Specialization**: Keep main/renderer specific features
3. **Clean Architecture**: Clear separation between logging concerns

---

## 🏗️ ARCHITECTURE OVERVIEW

```
Application Code
       ↓
Shared Logger (src/shared/logger.ts)
       ↓
Process-Specific Loggers
   ↙         ↓         ↘
Main      Renderer    Browser
Logger    Logger      Logger
   ↓         ↓         ↓
File      IPC +      Console +
System    Ring       Performance
          Buffer     Timing
```

### Data Flow:
1. **Application Code** calls shared logger methods
2. **Shared Logger** routes to appropriate process-specific logger  
3. **Process Loggers** handle output (files, console, database, IPC)
4. **Ring Buffer** maintains recent logs for debugging
5. **Database** stores error logs for analysis

---

## 🔍 CURRENT ISSUES

### 1. Multiple Import Paths
**Problem**: Components use different import paths for logging
```typescript
// Inconsistent imports across codebase:
import { logger } from '@shared/logger'           // Recommended
import { logger } from '../../utils/logger'       // Legacy renderer
import { logger } from '../logging/main/MainLogger' // Main process
```

**Solution**: Standardize on shared logger import

### 2. Legacy Components
**Problem**: 20+ components still use renderer utils logger
**Impact**: Inconsistent logging behavior, maintenance burden
**Solution**: Systematic migration to shared logger

### 3. Console.log in Application Code
**Problem**: Some application code still uses console.log (21 instances found)
**Solution**: Replace with proper logger calls

---

## 📋 VERIFICATION COMMANDS

```bash
# Check which logger implementations exist
find src/ -name "*logger*.ts" | grep -v node_modules | grep -v __tests__

# Check console.log usage in application code (excluding scripts)
grep -r "console\.log" src/ --exclude-dir=__tests__

# Check logger imports across codebase  
grep -r "import.*logger" src/

# Count logger usage by type
grep -r "from.*logger" src/ | cut -d: -f2 | sort | uniq -c
```

---

## 🎯 RECOMMENDATIONS

### For New Code:
1. **Always use shared logger**: `import { logger } from '@shared/logger'`
2. **Use appropriate categories**: `logger.workflow.info()`, `logger.scheduler.debug()`
3. **Never use console.log** in application code
4. **Include context** in log messages

### For Existing Code:
1. **Migrate gradually** from legacy loggers to shared logger
2. **Keep existing functionality** during migration
3. **Test thoroughly** after logger changes
4. **Document breaking changes**

### For Scripts:
1. **Console.log is acceptable** for direct user output
2. **Use structured logging** for complex scripts if needed
3. **Document script logging decisions** in comments

---

**Last Updated**: 2025-09-09  
**Next Review**: During logging consolidation project  
**Owner**: Development team

---

*This document was created to clarify the multiple logger implementations and provide guidance on which to use. It should be updated whenever logging architecture changes.*