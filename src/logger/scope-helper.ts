/**
 * Helper to get the appropriate scoped logger
 */

import { logger } from './index'
import { LogScope } from './types'
import { ScopedLogger } from './core/scoped-logger'

export function getScopedLogger(scope: LogScope): ScopedLogger {
  switch (scope) {
    case LogScope.UI:
      return logger.ui
    case LogScope.Database:
      return logger.db
    case LogScope.Server:
      return logger.server
    case LogScope.IPC:
      return logger.ipc
    case LogScope.System:
    default:
      return logger.system
  }
}
