/**
 * Application Configuration
 *
 * Manages configuration for server/client mode operation.
 * Configuration can come from environment variables or a config file.
 */

/**
 * Application mode
 * - 'server': Run both the API server and Electron UI (primary machine)
 * - 'client': Run only Electron UI, connect to remote server
 * - 'local': Traditional mode - use local IPC (no network server)
 */
export type AppMode = 'server' | 'client' | 'local'

/**
 * Application configuration
 */
export interface AppConfig {
  /** Operating mode */
  mode: AppMode

  /** Server URL for client mode (e.g., 'http://192.168.1.100:3001') */
  serverUrl: string

  /** API key for authentication */
  apiKey: string

  /** Port for server mode */
  port: number

  /** Whether to use tRPC instead of IPC */
  useTrpc: boolean
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AppConfig = {
  mode: 'local',
  serverUrl: 'http://localhost:3001',
  apiKey: '',
  port: 3001,
  useTrpc: false,
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const mode = (process.env.TASK_PLANNER_MODE || 'local') as AppMode

  // Validate mode
  if (!['server', 'client', 'local'].includes(mode)) {
    console.warn(`Invalid TASK_PLANNER_MODE "${mode}", falling back to "local"`)
  }

  const config: AppConfig = {
    mode: ['server', 'client', 'local'].includes(mode) ? mode : 'local',
    serverUrl: process.env.TASK_PLANNER_SERVER_URL || DEFAULT_CONFIG.serverUrl,
    apiKey: process.env.TASK_PLANNER_API_KEY || DEFAULT_CONFIG.apiKey,
    port: parseInt(process.env.TASK_PLANNER_PORT || String(DEFAULT_CONFIG.port), 10),
    useTrpc: mode === 'server' || mode === 'client',
  }

  return config
}

/**
 * Get configuration for the renderer process
 * This is exposed via the preload script
 */
export function getRendererConfig(): {
  mode: AppMode
  serverUrl: string
  apiKey: string
  useTrpc: boolean
} {
  const config = loadConfig()
  return {
    mode: config.mode,
    serverUrl: config.mode === 'server' ? `http://localhost:${config.port}` : config.serverUrl,
    apiKey: config.apiKey,
    useTrpc: config.useTrpc,
  }
}

// Export for use in main process
export const config = loadConfig()
