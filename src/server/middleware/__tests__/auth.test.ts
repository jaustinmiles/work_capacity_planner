/**
 * Tests for the API key authentication middleware.
 *
 * Regression coverage for the fail-open vulnerability: with no
 * TASK_PLANNER_API_KEY configured, validateApiKey used to return
 * isAuthenticated: true for EVERY request regardless of environment.
 * The middleware must fail CLOSED in production (NODE_ENV=production),
 * and the boot policy must tell the server to refuse to start.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  validateApiKey,
  evaluateApiKeyBootPolicy,
  ApiKeyBootStatus,
} from '../auth'

const API_KEY_ENV = 'TASK_PLANNER_API_KEY'
const NODE_ENV = 'NODE_ENV'
const TEST_KEY = 'test-api-key-0123456789abcdef'

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('auth middleware', () => {
  const originalNodeEnv = process.env[NODE_ENV]
  const originalApiKey = process.env[API_KEY_ENV]

  afterEach(() => {
    setEnv(NODE_ENV, originalNodeEnv)
    setEnv(API_KEY_ENV, originalApiKey)
  })

  describe('validateApiKey with a configured key', () => {
    it('authenticates the correct key', () => {
      setEnv(API_KEY_ENV, TEST_KEY)

      const result = validateApiKey(TEST_KEY)

      expect(result.isAuthenticated).toBe(true)
      expect(result.apiKey).toBe(TEST_KEY)
    })

    it('rejects a wrong key of the same length', () => {
      setEnv(API_KEY_ENV, TEST_KEY)
      const wrongKey = TEST_KEY.replace(/.$/, 'X')

      const result = validateApiKey(wrongKey)

      expect(result.isAuthenticated).toBe(false)
      expect(result.apiKey).toBeNull()
    })

    it('rejects a key of a different length', () => {
      setEnv(API_KEY_ENV, TEST_KEY)

      expect(validateApiKey(`${TEST_KEY}extra`).isAuthenticated).toBe(false)
      expect(validateApiKey('short').isAuthenticated).toBe(false)
    })

    it('rejects a missing key', () => {
      setEnv(API_KEY_ENV, TEST_KEY)

      const result = validateApiKey(undefined)

      expect(result.isAuthenticated).toBe(false)
      expect(result.apiKey).toBeNull()
    })

    it('authenticates the correct key in production too', () => {
      setEnv(NODE_ENV, 'production')
      setEnv(API_KEY_ENV, TEST_KEY)

      expect(validateApiKey(TEST_KEY).isAuthenticated).toBe(true)
    })
  })

  describe('validateApiKey with NO configured key', () => {
    it('allows open access outside production (development convenience)', () => {
      setEnv(NODE_ENV, 'development')
      setEnv(API_KEY_ENV, undefined)

      const result = validateApiKey(undefined)

      expect(result.isAuthenticated).toBe(true)
      expect(result.apiKey).toBeNull()
    })

    it('allows open access when NODE_ENV is unset', () => {
      setEnv(NODE_ENV, undefined)
      setEnv(API_KEY_ENV, undefined)

      expect(validateApiKey(undefined).isAuthenticated).toBe(true)
    })

    it('REGRESSION: fails closed in production — unset key never grants access', () => {
      setEnv(NODE_ENV, 'production')
      setEnv(API_KEY_ENV, undefined)

      expect(validateApiKey(undefined).isAuthenticated).toBe(false)
      // No provided key can authenticate against an unconfigured server
      expect(validateApiKey('any-guess').isAuthenticated).toBe(false)
    })

    it('REGRESSION: fails closed in production for an empty-string key (the .env.server.example default)', () => {
      setEnv(NODE_ENV, 'production')
      setEnv(API_KEY_ENV, '')

      expect(validateApiKey(undefined).isAuthenticated).toBe(false)
      expect(validateApiKey('').isAuthenticated).toBe(false)
    })

    it('REGRESSION: fails closed in production for a whitespace-only key', () => {
      setEnv(NODE_ENV, 'production')
      setEnv(API_KEY_ENV, '   ')

      expect(validateApiKey('   ').isAuthenticated).toBe(false)
    })

    it('treats an empty-string key as unconfigured in development (open access)', () => {
      setEnv(NODE_ENV, 'development')
      setEnv(API_KEY_ENV, '')

      expect(validateApiKey(undefined).isAuthenticated).toBe(true)
    })
  })

  describe('evaluateApiKeyBootPolicy', () => {
    it('returns Configured when a non-empty key is set, regardless of environment', () => {
      expect(evaluateApiKeyBootPolicy('production', TEST_KEY)).toBe(
        ApiKeyBootStatus.Configured,
      )
      expect(evaluateApiKeyBootPolicy('development', TEST_KEY)).toBe(
        ApiKeyBootStatus.Configured,
      )
      expect(evaluateApiKeyBootPolicy(undefined, TEST_KEY)).toBe(
        ApiKeyBootStatus.Configured,
      )
    })

    it('returns MissingProduction when production has no key (server must refuse to start)', () => {
      expect(evaluateApiKeyBootPolicy('production', undefined)).toBe(
        ApiKeyBootStatus.MissingProduction,
      )
    })

    it('treats empty and whitespace-only keys as missing in production', () => {
      expect(evaluateApiKeyBootPolicy('production', '')).toBe(
        ApiKeyBootStatus.MissingProduction,
      )
      expect(evaluateApiKeyBootPolicy('production', '   ')).toBe(
        ApiKeyBootStatus.MissingProduction,
      )
    })

    it('returns MissingDevelopment outside production (boot allowed, warning required)', () => {
      expect(evaluateApiKeyBootPolicy('development', undefined)).toBe(
        ApiKeyBootStatus.MissingDevelopment,
      )
      expect(evaluateApiKeyBootPolicy('test', undefined)).toBe(
        ApiKeyBootStatus.MissingDevelopment,
      )
      expect(evaluateApiKeyBootPolicy(undefined, undefined)).toBe(
        ApiKeyBootStatus.MissingDevelopment,
      )
    })
  })
})
