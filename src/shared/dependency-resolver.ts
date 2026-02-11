/**
 * Dependency Resolver - Unified resolution with fuzzy matching and confidence scoring
 *
 * This service provides robust dependency resolution for workflow steps,
 * handling variations in naming, typos, and ambiguous references.
 *
 * Resolution strategies (in priority order):
 * 1. Exact ID match
 * 2. Exact name match (case-insensitive)
 * 3. Fuzzy match (Levenshtein distance, threshold 0.7)
 * 4. Partial match (contains/startsWith)
 * 5. Step index ("step 1", "step-0")
 */

import { logger } from '../logger'

/**
 * Represents an available step that can be referenced as a dependency
 */
export interface AvailableStep {
  id: string
  name: string
  index?: number
}

/**
 * Resolution strategy used to match a dependency
 */
export type ResolutionStrategy =
  | 'exact_id'
  | 'exact_name'
  | 'fuzzy'
  | 'partial'
  | 'step_index'
  | 'failed'

/**
 * Result of resolving a single dependency reference
 */
export interface ResolutionResult {
  /** Original reference string */
  originalRef: string
  /** Resolved step ID (null if resolution failed) */
  resolvedId: string | null
  /** Resolved step name (for display) */
  resolvedName: string | null
  /** Confidence score 0-1 (1 = exact match) */
  confidence: number
  /** Strategy used for resolution */
  strategy: ResolutionStrategy
  /** Alternative candidates when ambiguous */
  alternatives?: Array<{
    id: string
    name: string
    score: number
    strategy: ResolutionStrategy
  }>
}

/**
 * Report from batch dependency resolution
 */
export interface DependencyResolutionReport {
  /** All resolution results */
  results: ResolutionResult[]
  /** Successfully resolved dependencies */
  resolved: Array<{ ref: string; id: string; confidence: number }>
  /** Failed resolutions */
  failed: Array<{ ref: string; reason: string }>
  /** Ambiguous resolutions requiring confirmation */
  ambiguous: Array<{
    ref: string
    resolvedId: string
    confidence: number
    alternatives: Array<{ id: string; name: string; score: number }>
  }>
  /** Overall success rate */
  successRate: number
  /** Whether any resolutions need user confirmation */
  needsConfirmation: boolean
}

/**
 * Options for dependency resolution
 */
export interface ResolutionOptions {
  /** Minimum similarity score for fuzzy matching (default: 0.7) */
  fuzzyThreshold?: number
  /** Confidence threshold below which to flag as ambiguous (default: 0.9) */
  ambiguousThreshold?: number
  /** Maximum number of alternatives to return (default: 3) */
  maxAlternatives?: number
}

const DEFAULT_OPTIONS: Required<ResolutionOptions> = {
  fuzzyThreshold: 0.6, // Lower threshold to catch more typos
  ambiguousThreshold: 0.9,
  maxAlternatives: 3,
}

/** Minimum reference length to attempt resolution */
const MIN_REF_LENGTH = 2

/**
 * Calculate Levenshtein (edit) distance between two strings
 * Lower distance = more similar
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  if (aLower === bLower) return 0
  if (aLower.length === 0) return bLower.length
  if (bLower.length === 0) return aLower.length

  // Create distance matrix
  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0]![j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,      // deletion
        matrix[i]![j - 1]! + 1,      // insertion
        matrix[i - 1]![j - 1]! + cost, // substitution
      )
    }
  }

  return matrix[aLower.length]![bLower.length]!
}

/**
 * Calculate normalized similarity score between two strings
 * Returns 0-1 where 1 = identical
 */
export function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b)
  const maxLength = Math.max(a.length, b.length)
  if (maxLength === 0) return 1 // Both empty strings are identical
  return 1 - distance / maxLength
}

/**
 * Normalize a string for comparison (lowercase, trim, collapse whitespace)
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check if string matches "step N" or "step-N" pattern
 * Returns the 0-based index or null
 */
function parseStepIndex(ref: string): number | null {
  // Match "step 1", "Step 1", "step-1", "step-0", etc.
  const match = ref.match(/^step[\s-]?(\d+)$/i)
  if (!match || !match[1]) return null

  const num = parseInt(match[1], 10)
  // Check if it looks like 0-based (step-0) or 1-based (step 1)
  // If reference contains a hyphen and starts with 0, treat as 0-based
  if (ref.includes('-') || ref.includes('0')) {
    return num
  }
  // Otherwise treat as 1-based (user-friendly)
  return num - 1
}

/**
 * Extract significant words from a string (removes common words)
 */
function extractKeywords(str: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or'])
  return normalizeString(str)
    .split(' ')
    .filter(word => word.length > 1 && !stopWords.has(word))
}

/**
 * Calculate word-based similarity (Jaccard index)
 * Good for matching phrases with word variations
 */
function wordSimilarity(a: string, b: string): number {
  const wordsA = new Set(extractKeywords(a))
  const wordsB = new Set(extractKeywords(b))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  // Calculate intersection
  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  // Jaccard index: intersection / union
  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Resolve a single dependency reference to a step ID
 */
export function resolveDependency(
  ref: string,
  availableSteps: AvailableStep[],
  options: ResolutionOptions = {},
): ResolutionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const normalizedRef = normalizeString(ref)

  // Early return for empty or too-short references
  if (normalizedRef.length < MIN_REF_LENGTH) {
    return {
      originalRef: ref,
      resolvedId: null,
      resolvedName: null,
      confidence: 0,
      strategy: 'failed',
    }
  }

  // Track all candidates with scores
  const candidates: Array<{
    id: string
    name: string
    score: number
    strategy: ResolutionStrategy
  }> = []

  // Strategy 1: Exact ID match
  const idMatch = availableSteps.find(s => s.id === ref)
  if (idMatch) {
    return {
      originalRef: ref,
      resolvedId: idMatch.id,
      resolvedName: idMatch.name,
      confidence: 1.0,
      strategy: 'exact_id',
    }
  }

  // Strategy 2: Exact name match (case-insensitive)
  const exactNameMatch = availableSteps.find(
    s => normalizeString(s.name) === normalizedRef,
  )
  if (exactNameMatch) {
    return {
      originalRef: ref,
      resolvedId: exactNameMatch.id,
      resolvedName: exactNameMatch.name,
      confidence: 1.0,
      strategy: 'exact_name',
    }
  }

  // Strategy 3: Fuzzy match using Levenshtein distance
  for (const step of availableSteps) {
    const score = similarityScore(normalizedRef, normalizeString(step.name))
    if (score >= opts.fuzzyThreshold) {
      candidates.push({
        id: step.id,
        name: step.name,
        score,
        strategy: 'fuzzy',
      })
    }
  }

  // Strategy 3b: Word-based matching (for semantic similarity)
  // Good for "Write tests" matching "Write unit tests" or "Code review" matching "Review code changes"
  for (const step of availableSteps) {
    const wordScore = wordSimilarity(normalizedRef, step.name)
    if (wordScore >= 0.5) { // At least half the words match
      const existing = candidates.find(c => c.id === step.id)
      // Adjust score: word matching is reliable but less precise than fuzzy
      const adjustedScore = 0.7 + (wordScore * 0.25) // 0.7-0.95 range
      if (!existing || existing.score < adjustedScore) {
        if (existing) {
          candidates.splice(candidates.indexOf(existing), 1)
        }
        candidates.push({
          id: step.id,
          name: step.name,
          score: adjustedScore,
          strategy: 'fuzzy', // Group with fuzzy since it's semantic matching
        })
      }
    }
  }

  // Strategy 4: Partial match (contains or startsWith)
  for (const step of availableSteps) {
    const normalizedName = normalizeString(step.name)
    // Check if ref contains step name or step name contains ref
    if (normalizedName.includes(normalizedRef) || normalizedRef.includes(normalizedName)) {
      // Calculate a score based on how much of the strings overlap
      const overlapRatio = Math.min(normalizedRef.length, normalizedName.length) /
        Math.max(normalizedRef.length, normalizedName.length)
      // Only add if not already in candidates with higher score
      const existing = candidates.find(c => c.id === step.id)
      if (!existing || existing.score < overlapRatio) {
        if (existing) {
          candidates.splice(candidates.indexOf(existing), 1)
        }
        candidates.push({
          id: step.id,
          name: step.name,
          score: Math.max(0.6, overlapRatio * 0.9), // Partial matches get 0.6-0.9 confidence
          strategy: 'partial',
        })
      }
    }
  }

  // Strategy 5: Step index reference
  const stepIndex = parseStepIndex(ref)
  if (stepIndex !== null) {
    // Find step by index
    const stepByIndex = availableSteps.find(s => s.index === stepIndex)
    if (stepByIndex) {
      candidates.push({
        id: stepByIndex.id,
        name: stepByIndex.name,
        score: 0.85, // Step index is fairly reliable but not exact
        strategy: 'step_index',
      })
    } else if (stepIndex >= 0 && stepIndex < availableSteps.length) {
      // Fallback: use array position if no explicit index
      const step = availableSteps[stepIndex]
      if (step) {
        candidates.push({
          id: step.id,
          name: step.name,
          score: 0.8,
          strategy: 'step_index',
        })
      }
    }
  }

  // Sort candidates by score (highest first)
  candidates.sort((a, b) => b.score - a.score)

  // If no candidates found, resolution failed
  if (candidates.length === 0) {
    logger.system.warn('Dependency resolution failed', {
      ref,
      availableSteps: availableSteps.map(s => s.name),
    }, 'dependency-resolve-failed')

    return {
      originalRef: ref,
      resolvedId: null,
      resolvedName: null,
      confidence: 0,
      strategy: 'failed',
    }
  }

  // Best candidate
  const best = candidates[0]!
  const alternatives = candidates.slice(1, opts.maxAlternatives + 1)

  return {
    originalRef: ref,
    resolvedId: best.id,
    resolvedName: best.name,
    confidence: best.score,
    strategy: best.strategy,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  }
}

/**
 * Resolve multiple dependency references with a comprehensive report
 */
export function resolveDependencies(
  refs: string[],
  availableSteps: AvailableStep[],
  options: ResolutionOptions = {},
): DependencyResolutionReport {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const results: ResolutionResult[] = []
  const resolved: DependencyResolutionReport['resolved'] = []
  const failed: DependencyResolutionReport['failed'] = []
  const ambiguous: DependencyResolutionReport['ambiguous'] = []

  for (const ref of refs) {
    const result = resolveDependency(ref, availableSteps, options)
    results.push(result)

    if (result.resolvedId === null) {
      failed.push({
        ref,
        reason: `No matching step found for "${ref}"`,
      })
    } else if (result.confidence < opts.ambiguousThreshold) {
      // Low confidence - mark as ambiguous
      ambiguous.push({
        ref,
        resolvedId: result.resolvedId,
        confidence: result.confidence,
        alternatives: result.alternatives || [],
      })
      // Still count as resolved, but flagged
      resolved.push({
        ref,
        id: result.resolvedId,
        confidence: result.confidence,
      })
    } else {
      resolved.push({
        ref,
        id: result.resolvedId,
        confidence: result.confidence,
      })
    }
  }

  const successRate = refs.length > 0 ? resolved.length / refs.length : 1

  return {
    results,
    resolved,
    failed,
    ambiguous,
    successRate,
    needsConfirmation: ambiguous.length > 0 || failed.length > 0,
  }
}

/**
 * Get resolved IDs from a resolution report, filtering out failures
 * Useful for getting the final dependency array
 */
export function getResolvedIds(report: DependencyResolutionReport): string[] {
  return report.resolved.map(r => r.id)
}

/**
 * Format a resolution report for display to users
 */
export function formatResolutionReport(report: DependencyResolutionReport): string {
  const lines: string[] = []

  if (report.failed.length > 0) {
    lines.push('Failed to resolve:')
    for (const f of report.failed) {
      lines.push(`  - "${f.ref}": ${f.reason}`)
    }
  }

  if (report.ambiguous.length > 0) {
    lines.push('Ambiguous (please confirm):')
    for (const a of report.ambiguous) {
      const altNames = a.alternatives.map(alt => `"${alt.name}"`).join(', ')
      lines.push(`  - "${a.ref}" → resolved with ${Math.round(a.confidence * 100)}% confidence`)
      if (a.alternatives.length > 0) {
        lines.push(`    Alternatives: ${altNames}`)
      }
    }
  }

  return lines.join('\n')
}
