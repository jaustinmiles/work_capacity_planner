/**
 * Timezone Handling Tests
 *
 * These tests verify that the time utilities correctly handle timezone conversion.
 * The key scenarios are:
 * 1. Strings WITHOUT timezone (no Z) → treat as local time
 * 2. Strings WITH timezone (Z suffix) → parse as UTC, convert to local
 *
 * Example for Seattle (PST, UTC-8):
 * - "2026-01-25T09:00:00" (no Z) → 9 AM local
 * - "2026-01-25T17:00:00Z" (with Z) → 5 PM UTC = 9 AM PST
 */

import { safeParseDateString, extractTimeFromISO, formatTimeHHMM } from '../time-utils'

describe('Timezone Handling', () => {
  describe('safeParseDateString', () => {
    it('should parse string WITHOUT timezone as local time', () => {
      // No Z suffix = local time
      const input = '2026-01-25T09:00:00'
      const date = safeParseDateString(input)

      expect(date).toBeDefined()
      // getHours() returns LOCAL time - should be 9
      expect(date!.getHours()).toBe(9)
      expect(date!.getMinutes()).toBe(0)
    })

    it('should parse string WITH Z suffix as UTC and convert to local', () => {
      // Z suffix = UTC time
      // 17:00 UTC = 09:00 PST (UTC-8) = 10:00 PDT (UTC-7)
      const input = '2026-01-25T17:00:00Z'
      const date = safeParseDateString(input)

      expect(date).toBeDefined()
      // getUTCHours() should be 17 (preserved UTC)
      expect(date!.getUTCHours()).toBe(17)
      expect(date!.getUTCMinutes()).toBe(0)

      // getHours() returns local time - varies by timezone
      // The important thing is that local time is DIFFERENT from UTC
      const localHour = date!.getHours()
      const timezoneOffsetHours = date!.getTimezoneOffset() / 60

      // Verify: localHour = UTCHour - offsetHours (offset is positive for west of UTC)
      // Example: 17 UTC - 8 (PST offset) = 9 local
      expect(localHour).toBe((17 - timezoneOffsetHours + 24) % 24)
    })

    it('should parse YYYY-MM-DD format as local midnight', () => {
      const input = '2026-01-25'
      const date = safeParseDateString(input)

      expect(date).toBeDefined()
      expect(date!.getHours()).toBe(0)
      expect(date!.getMinutes()).toBe(0)
      expect(date!.getDate()).toBe(25)
    })

    it('should parse string with offset as the correct local time', () => {
      // +00:00 is same as Z
      const input = '2026-01-25T17:00:00+00:00'
      const date = safeParseDateString(input)

      expect(date).toBeDefined()
      expect(date!.getUTCHours()).toBe(17)
    })

    it('should return undefined for invalid strings', () => {
      expect(safeParseDateString(undefined)).toBeUndefined()
      expect(safeParseDateString('')).toBeUndefined()
      expect(safeParseDateString('not a date')).toBeUndefined()
    })
  })

  describe('extractTimeFromISO', () => {
    it('should extract local time from Date object', () => {
      // Create a date at 9 AM local
      const date = new Date(2026, 0, 25, 9, 30, 0)
      const timeStr = extractTimeFromISO(date)

      expect(timeStr).toBe('09:30')
    })

    it('should extract time directly from string WITHOUT timezone', () => {
      // No Z = already local time, extract directly
      const input = '2026-01-25T09:30:00'
      const timeStr = extractTimeFromISO(input)

      expect(timeStr).toBe('09:30')
    })

    it('should convert UTC to local when string has Z suffix', () => {
      // Z suffix = UTC, must convert to local
      // 17:30 UTC should become local time (not stay as 17:30)
      const input = '2026-01-25T17:30:00Z'
      const timeStr = extractTimeFromISO(input)

      // Parse the same string to get expected local time
      const expectedDate = new Date(input)
      const expectedTime = formatTimeHHMM(expectedDate)

      expect(timeStr).toBe(expectedTime)
      // In any timezone west of UTC, this should NOT be 17:30
      // (Only in UTC+0 or east would it be 17:30 or later)
      const localOffset = new Date().getTimezoneOffset()
      if (localOffset > 0) {
        // West of UTC - local time should be earlier than UTC
        expect(timeStr).not.toBe('17:30')
      }
    })

    it('should handle simple HH:MM format', () => {
      const input = '14:45'
      const timeStr = extractTimeFromISO(input)

      expect(timeStr).toBe('14:45')
    })
  })

  describe('Round-trip through serialization', () => {
    it('should preserve local time through toISOString and back', () => {
      // Create a Date for 9 AM local
      const localDate = new Date(2026, 0, 25, 9, 0, 0)
      const originalLocalHour = localDate.getHours()

      // Serialize (what tRPC/superjson does internally)
      const serialized = localDate.toISOString() // "2026-01-25T17:00:00.000Z" in PST

      // Deserialize
      const deserialized = new Date(serialized)

      // Local hour should be preserved through round-trip
      expect(deserialized.getHours()).toBe(originalLocalHour)
      expect(deserialized.getHours()).toBe(9)
    })

    it('should correctly handle safeParseDateString for serialized dates', () => {
      // Simulate what happens when Date goes through database
      const originalDate = new Date(2026, 0, 25, 9, 0, 0)
      const serialized = originalDate.toISOString() // Has Z suffix

      // Parse it back
      const parsed = safeParseDateString(serialized)

      expect(parsed).toBeDefined()
      expect(parsed!.getHours()).toBe(9) // Should still be 9 AM local
    })
  })

  describe('Seattle-specific scenarios', () => {
    // These tests document the expected behavior for a Seattle user (UTC-8 or UTC-7 DST)
    // The actual values depend on the machine's timezone, but the LOGIC is what matters

    it('should handle AI sending local time without Z', () => {
      // AI sends "9 AM" as "2026-01-25T09:00:00" (no Z)
      // This should be treated as 9 AM LOCAL
      const aiInput = '2026-01-25T09:00:00'

      const date = safeParseDateString(aiInput)
      expect(date!.getHours()).toBe(9) // 9 AM local

      const displayTime = extractTimeFromISO(aiInput)
      expect(displayTime).toBe('09:00')
    })

    it('should handle database returning UTC with Z', () => {
      // After saving, DB returns the same instant as UTC
      // For a Seattle user who saved 9 AM, DB stores as 17:00 UTC

      // Create what the user intended: 9 AM local
      const userIntent = new Date(2026, 0, 25, 9, 0, 0)

      // What DB would store (serialized to ISO/UTC)
      const dbStored = userIntent.toISOString() // "2026-01-25T17:00:00.000Z" in PST

      // When we parse it back, should be 9 AM local again
      const parsed = safeParseDateString(dbStored)
      expect(parsed!.getHours()).toBe(9)

      // When we display it, should show 09:00
      const displayTime = extractTimeFromISO(dbStored)
      expect(displayTime).toBe('09:00')
    })

    it('should NOT double-convert timezone', () => {
      // The bug we're fixing: time was being shifted TWICE
      // User says 9 AM → stored as 17:00 UTC → displayed as 17:00 (wrong!)

      // Correct: 9 AM local → 17:00 UTC → 9 AM local (on display)
      const localNineAM = new Date(2026, 0, 25, 9, 0, 0)
      const utcString = localNineAM.toISOString()

      // Parse should give back 9 AM local
      const parsed = safeParseDateString(utcString)
      expect(parsed!.getHours()).toBe(9)

      // Extract should also give 09:00
      const extracted = extractTimeFromISO(utcString)
      expect(extracted).toBe('09:00')

      // NOT 17:00 (which would be the UTC value)
      expect(extracted).not.toBe('17:00')
    })
  })
})
