/**
 * Tests for JSON utilities
 */

import { describe, it, expect } from 'vitest'
import { extractJsonObjectText } from '../json-utils'

describe('extractJsonObjectText', () => {
  it('returns a plain JSON object unchanged', () => {
    expect(extractJsonObjectText('{"a": 1}')).toBe('{"a": 1}')
  })

  it('strips a markdown code fence', () => {
    expect(extractJsonObjectText('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('strips a prose preamble and suffix', () => {
    expect(extractJsonObjectText('Here is the result: {"a": 1} — hope that helps!')).toBe(
      '{"a": 1}',
    )
  })

  it('keeps nested objects intact', () => {
    expect(extractJsonObjectText('noise {"a": {"b": 2}} noise')).toBe('{"a": {"b": 2}}')
  })

  it('returns the trimmed input when no object braces exist', () => {
    expect(extractJsonObjectText('  no json here  ')).toBe('no json here')
  })

  it('returns the trimmed input when braces are inverted', () => {
    expect(extractJsonObjectText('} backwards {')).toBe('} backwards {')
  })
})
