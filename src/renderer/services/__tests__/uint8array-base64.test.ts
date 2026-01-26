/**
 * Tests for uint8ArrayToBase64 function
 *
 * CRITICAL: These tests protect against a bug where browser Uint8Array.toString('base64')
 * doesn't work like Node's Buffer.toString('base64'). This caused voice transcription
 * to fail because audio data was corrupted during base64 encoding.
 *
 * The bug manifested as:
 * - OpenAI API returning "400 Invalid file format" for .webm files
 * - Audio files being saved with corrupted/garbage content
 * - The saved files not being recognized as valid WebM by the `file` command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { uint8ArrayToBase64 } from '../database-trpc'

describe('uint8ArrayToBase64', () => {
  // Mock window.btoa for browser environment simulation
  const originalWindow = global.window

  beforeEach(() => {
    // Set up browser-like environment
    global.window = {
      ...originalWindow,
      btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
    } as typeof window
  })

  afterEach(() => {
    global.window = originalWindow
  })

  describe('basic functionality', () => {
    it('should correctly encode a simple Uint8Array to base64', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      const result = uint8ArrayToBase64(input)
      expect(result).toBe('SGVsbG8=')
    })

    it('should correctly encode an empty Uint8Array', () => {
      const input = new Uint8Array([])
      const result = uint8ArrayToBase64(input)
      expect(result).toBe('')
    })

    it('should correctly encode binary data with all byte values', () => {
      // Test with bytes 0-255 to ensure all values are handled
      const input = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        input[i] = i
      }
      const result = uint8ArrayToBase64(input)

      // Verify by decoding back
      const decoded = Buffer.from(result, 'base64')
      expect(decoded.length).toBe(256)
      for (let i = 0; i < 256; i++) {
        expect(decoded[i]).toBe(i)
      }
    })

    it('should handle WebM magic bytes correctly', () => {
      // Real WebM files start with EBML header: 1a 45 df a3
      const webmHeader = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])
      const result = uint8ArrayToBase64(webmHeader)
      expect(result).toBe('GkXfow==')

      // Verify round-trip
      const decoded = Buffer.from(result, 'base64')
      expect(decoded[0]).toBe(0x1a)
      expect(decoded[1]).toBe(0x45)
      expect(decoded[2]).toBe(0xdf)
      expect(decoded[3]).toBe(0xa3)
    })
  })

  describe('large data handling', () => {
    it('should handle data larger than chunk size (8192 bytes)', () => {
      // Create 20KB of data to test chunking
      const size = 20000
      const input = new Uint8Array(size)
      for (let i = 0; i < size; i++) {
        input[i] = i % 256
      }

      const result = uint8ArrayToBase64(input)

      // Verify by decoding back
      const decoded = Buffer.from(result, 'base64')
      expect(decoded.length).toBe(size)
      for (let i = 0; i < size; i++) {
        expect(decoded[i]).toBe(i % 256)
      }
    })

    it('should handle exactly chunk-size data (8192 bytes)', () => {
      const size = 8192
      const input = new Uint8Array(size)
      for (let i = 0; i < size; i++) {
        input[i] = i % 256
      }

      const result = uint8ArrayToBase64(input)
      const decoded = Buffer.from(result, 'base64')
      expect(decoded.length).toBe(size)
    })

    it('should handle chunk-size + 1 data (8193 bytes)', () => {
      const size = 8193
      const input = new Uint8Array(size)
      for (let i = 0; i < size; i++) {
        input[i] = i % 256
      }

      const result = uint8ArrayToBase64(input)
      const decoded = Buffer.from(result, 'base64')
      expect(decoded.length).toBe(size)
    })

    it('should handle realistic audio buffer size (~100KB)', () => {
      // Typical voice recording is around 100KB
      const size = 100000
      const input = new Uint8Array(size)
      for (let i = 0; i < size; i++) {
        input[i] = i % 256
      }

      const result = uint8ArrayToBase64(input)
      const decoded = Buffer.from(result, 'base64')
      expect(decoded.length).toBe(size)
    })
  })

  describe('Node Buffer handling', () => {
    it('should handle Node Buffer input correctly', () => {
      const input = Buffer.from('Hello, World!')
      const result = uint8ArrayToBase64(input)
      expect(result).toBe('SGVsbG8sIFdvcmxkIQ==')
    })

    it('should handle Node Buffer with binary data', () => {
      const input = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
      const result = uint8ArrayToBase64(input)
      expect(result).toBe('GkXfow==')
    })
  })

  describe('regression tests for voice transcription bug', () => {
    it('should NOT produce corrupted output like Uint8Array.toString() does', () => {
      const input = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])

      // This is what the broken code was doing - demonstrating the bug
      const brokenOutput = input.toString()
      expect(brokenOutput).toBe('26,69,223,163') // Comma-separated decimals - WRONG!

      // Our function should produce proper base64
      const correctOutput = uint8ArrayToBase64(input)
      expect(correctOutput).toBe('GkXfow==') // Proper base64 - CORRECT!
      expect(correctOutput).not.toContain(',') // Should NOT contain commas
    })

    it('should produce output that decodes to identical bytes', () => {
      // Simulate actual audio data pattern
      const input = new Uint8Array(1000)
      for (let i = 0; i < 1000; i++) {
        input[i] = Math.floor(Math.random() * 256)
      }

      const encoded = uint8ArrayToBase64(input)
      const decoded = Buffer.from(encoded, 'base64')

      // Every single byte must match
      expect(decoded.length).toBe(input.length)
      for (let i = 0; i < input.length; i++) {
        expect(decoded[i]).toBe(input[i])
      }
    })

    it('should be compatible with server-side Buffer.from(base64, "base64")', () => {
      // This simulates the full round-trip: browser -> server
      const originalData = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03])

      // Browser side: encode to base64
      const base64 = uint8ArrayToBase64(originalData)

      // Server side: decode from base64 (using Node Buffer)
      const serverBuffer = Buffer.from(base64, 'base64')

      // Data should be identical
      expect(serverBuffer.length).toBe(originalData.length)
      for (let i = 0; i < originalData.length; i++) {
        expect(serverBuffer[i]).toBe(originalData[i])
      }
    })
  })
})
