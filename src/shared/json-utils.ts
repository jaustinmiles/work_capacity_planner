/**
 * JSON Utilities
 *
 * Helpers for defensively parsing JSON out of AI model output.
 * Models frequently wrap JSON in markdown code fences or add a short
 * prose preamble ("Here is the analysis: ..."), which breaks a raw
 * JSON.parse on the full response text.
 */

/**
 * Extract the JSON object substring from a model response.
 *
 * Returns the text from the first '{' to the last '}' (inclusive),
 * which strips markdown code fences and prose preambles/suffixes.
 * If no object braces are found, returns the trimmed input unchanged
 * so the caller's JSON.parse produces a normal SyntaxError.
 */
export function extractJsonObjectText(raw: string): string {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return trimmed
  return trimmed.substring(start, end + 1)
}
