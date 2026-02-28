import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  levenshteinDistance,
  similarityScore,
  resolveDependency,
  resolveDependencies,
  getResolvedIds,
  formatResolutionReport,
  type AvailableStep,
} from '../dependency-resolver'

// Mock the logger module
vi.mock('@/logger', () => ({
  logger: {
    system: {
      warn: vi.fn(),
    },
  },
}))

describe('Dependency Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0)
      expect(levenshteinDistance('', '')).toBe(0)
    })

    it('should be case-insensitive', () => {
      expect(levenshteinDistance('Hello', 'hello')).toBe(0)
      expect(levenshteinDistance('WORLD', 'world')).toBe(0)
    })

    it('should calculate correct distance for insertions', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1)
      expect(levenshteinDistance('', 'abc')).toBe(3)
    })

    it('should calculate correct distance for deletions', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1)
      expect(levenshteinDistance('abc', '')).toBe(3)
    })

    it('should calculate correct distance for substitutions', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1)
      expect(levenshteinDistance('abc', 'xyz')).toBe(3)
    })

    it('should handle mixed operations', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
      expect(levenshteinDistance('Review Results', 'Review the results')).toBe(4)
    })
  })

  describe('similarityScore', () => {
    it('should return 1 for identical strings', () => {
      expect(similarityScore('hello', 'hello')).toBe(1)
      expect(similarityScore('', '')).toBe(1)
    })

    it('should return 0 for completely different strings of same length', () => {
      expect(similarityScore('abc', 'xyz')).toBe(0)
    })

    it('should return high score for similar strings', () => {
      const score = similarityScore('Review Results', 'Review the results')
      expect(score).toBeGreaterThan(0.7)
    })

    it('should be symmetric', () => {
      const score1 = similarityScore('abc', 'abd')
      const score2 = similarityScore('abd', 'abc')
      expect(score1).toBe(score2)
    })
  })

  describe('resolveDependency', () => {
    const sampleSteps: AvailableStep[] = [
      { id: 'step-001', name: 'Setup Environment', index: 0 },
      { id: 'step-002', name: 'Install Dependencies', index: 1 },
      { id: 'step-003', name: 'Run Tests', index: 2 },
      { id: 'step-004', name: 'Review Results', index: 3 },
      { id: 'step-005', name: 'Deploy to Production', index: 4 },
    ]

    describe('exact ID matching', () => {
      it('should resolve exact ID match with confidence 1.0', () => {
        const result = resolveDependency('step-001', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        expect(result.confidence).toBe(1.0)
        expect(result.strategy).toBe('exact_id')
      })
    })

    describe('exact name matching', () => {
      it('should resolve exact name match with confidence 1.0', () => {
        const result = resolveDependency('Setup Environment', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        expect(result.confidence).toBe(1.0)
        expect(result.strategy).toBe('exact_name')
      })

      it('should be case-insensitive for name matching', () => {
        const result = resolveDependency('setup environment', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        expect(result.confidence).toBe(1.0)
        expect(result.strategy).toBe('exact_name')
      })

      it('should handle extra whitespace', () => {
        const result = resolveDependency('  Run   Tests  ', sampleSteps)
        expect(result.resolvedId).toBe('step-003')
        expect(result.strategy).toBe('exact_name')
      })
    })

    describe('fuzzy matching', () => {
      it('should resolve with fuzzy matching for similar names', () => {
        // "Review the results" vs "Review Results" - should match
        const result = resolveDependency('Review the results', sampleSteps)
        expect(result.resolvedId).toBe('step-004')
        expect(result.confidence).toBeGreaterThan(0.7)
        expect(result.strategy).toBe('fuzzy')
      })

      it('should handle typos', () => {
        // "Reveiw Results" (typo) vs "Review Results"
        const result = resolveDependency('Reveiw Results', sampleSteps)
        expect(result.resolvedId).toBe('step-004')
        expect(result.strategy).toBe('fuzzy')
      })

      it('should handle missing words', () => {
        const result = resolveDependency('Setup', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        // Can match via fuzzy (word matching) or partial
        expect(['fuzzy', 'partial']).toContain(result.strategy)
      })
    })

    describe('partial matching', () => {
      it('should match when reference contains step name', () => {
        const result = resolveDependency('First: Setup Environment Step', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
      })

      it('should match when step name contains reference', () => {
        const result = resolveDependency('Deploy', sampleSteps)
        expect(result.resolvedId).toBe('step-005')
        // Can match via fuzzy (word matching) or partial
        expect(['fuzzy', 'partial']).toContain(result.strategy)
      })
    })

    describe('step index matching', () => {
      it('should resolve "step 1" to first step (1-based)', () => {
        const result = resolveDependency('step 1', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        expect(result.strategy).toBe('step_index')
      })

      it('should resolve "Step 3" with capital S', () => {
        const result = resolveDependency('Step 3', sampleSteps)
        expect(result.resolvedId).toBe('step-003')
        expect(result.strategy).toBe('step_index')
      })

      it('should resolve "step-0" as 0-based index', () => {
        const result = resolveDependency('step-0', sampleSteps)
        expect(result.resolvedId).toBe('step-001')
        expect(result.strategy).toBe('step_index')
      })

      it('should resolve "step-2" as 0-based index', () => {
        const result = resolveDependency('step-2', sampleSteps)
        expect(result.resolvedId).toBe('step-003')
        expect(result.strategy).toBe('step_index')
      })
    })

    describe('failure cases', () => {
      it('should return failed strategy when no match found', () => {
        const result = resolveDependency('Completely Unrelated XYZ123', sampleSteps)
        expect(result.resolvedId).toBeNull()
        expect(result.confidence).toBe(0)
        expect(result.strategy).toBe('failed')
      })

      it('should return failed for empty reference', () => {
        const result = resolveDependency('', sampleSteps)
        expect(result.resolvedId).toBeNull()
        expect(result.strategy).toBe('failed')
      })

      it('should return failed for single character reference', () => {
        const result = resolveDependency('a', sampleSteps)
        expect(result.resolvedId).toBeNull()
        expect(result.strategy).toBe('failed')
      })

      it('should return failed for step index out of range', () => {
        const result = resolveDependency('step 99', sampleSteps)
        expect(result.resolvedId).toBeNull()
        expect(result.strategy).toBe('failed')
      })
    })

    describe('alternatives', () => {
      it('should provide alternatives when multiple matches possible', () => {
        const stepsWithSimilarNames: AvailableStep[] = [
          { id: 'step-1', name: 'Review Code', index: 0 },
          { id: 'step-2', name: 'Review Tests', index: 1 },
          { id: 'step-3', name: 'Review Docs', index: 2 },
        ]

        const result = resolveDependency('Review', stepsWithSimilarNames)
        expect(result.resolvedId).toBeTruthy()
        expect(result.alternatives).toBeDefined()
        expect(result.alternatives!.length).toBeGreaterThan(0)
      })
    })

    describe('edge cases', () => {
      it('should handle special characters', () => {
        const stepsWithSpecialChars: AvailableStep[] = [
          { id: 'step-1', name: 'Step (1): Setup', index: 0 },
          { id: 'step-2', name: 'Step [2] - Build', index: 1 },
        ]

        const result = resolveDependency('Step (1): Setup', stepsWithSpecialChars)
        expect(result.resolvedId).toBe('step-1')
      })

      it('should handle unicode characters', () => {
        const stepsWithUnicode: AvailableStep[] = [
          { id: 'step-1', name: 'Déployer le serveur', index: 0 },
        ]

        const result = resolveDependency('Déployer le serveur', stepsWithUnicode)
        expect(result.resolvedId).toBe('step-1')
      })

      it('should handle empty steps array', () => {
        const result = resolveDependency('Any Step', [])
        expect(result.resolvedId).toBeNull()
        expect(result.strategy).toBe('failed')
      })
    })
  })

  describe('resolveDependencies', () => {
    const sampleSteps: AvailableStep[] = [
      { id: 'step-001', name: 'Setup', index: 0 },
      { id: 'step-002', name: 'Build', index: 1 },
      { id: 'step-003', name: 'Test', index: 2 },
      { id: 'step-004', name: 'Deploy', index: 3 },
    ]

    it('should resolve multiple dependencies', () => {
      const refs = ['Setup', 'Build', 'Test']
      const report = resolveDependencies(refs, sampleSteps)

      expect(report.resolved.length).toBe(3)
      expect(report.failed.length).toBe(0)
      expect(report.successRate).toBe(1)
    })

    it('should track failed resolutions', () => {
      const refs = ['Setup', 'NonExistent', 'Test']
      const report = resolveDependencies(refs, sampleSteps)

      expect(report.resolved.length).toBe(2)
      expect(report.failed.length).toBe(1)
      expect(report.failed[0]!.ref).toBe('NonExistent')
      expect(report.successRate).toBeCloseTo(0.67, 1)
    })

    it('should flag ambiguous resolutions', () => {
      // "Stp" is a heavily abbreviated version that should match with low confidence
      const refs = ['Setap'] // Typo - should match "Setup" with lower confidence
      const report = resolveDependencies(refs, sampleSteps, {
        ambiguousThreshold: 0.95, // High threshold to catch this
        fuzzyThreshold: 0.5, // Lower threshold to allow the match
      })

      // Should resolve but be marked as ambiguous due to low confidence
      expect(report.resolved.length).toBe(1)
      expect(report.ambiguous.length).toBe(1)
      expect(report.needsConfirmation).toBe(true)
    })

    it('should set needsConfirmation when there are failures', () => {
      const refs = ['Setup', 'Unknown']
      const report = resolveDependencies(refs, sampleSteps)

      expect(report.needsConfirmation).toBe(true)
    })

    it('should not need confirmation for all exact matches', () => {
      const refs = ['Setup', 'Build']
      const report = resolveDependencies(refs, sampleSteps)

      expect(report.needsConfirmation).toBe(false)
    })

    it('should handle empty refs array', () => {
      const report = resolveDependencies([], sampleSteps)

      expect(report.resolved.length).toBe(0)
      expect(report.failed.length).toBe(0)
      expect(report.successRate).toBe(1)
      expect(report.needsConfirmation).toBe(false)
    })
  })

  describe('getResolvedIds', () => {
    it('should extract resolved IDs from report', () => {
      const sampleSteps: AvailableStep[] = [
        { id: 'step-001', name: 'Setup', index: 0 },
        { id: 'step-002', name: 'Build', index: 1 },
      ]

      const report = resolveDependencies(['Setup', 'Build'], sampleSteps)
      const ids = getResolvedIds(report)

      expect(ids).toEqual(['step-001', 'step-002'])
    })

    it('should not include failed resolutions', () => {
      const sampleSteps: AvailableStep[] = [
        { id: 'step-001', name: 'Setup', index: 0 },
      ]

      const report = resolveDependencies(['Setup', 'NonExistent'], sampleSteps)
      const ids = getResolvedIds(report)

      expect(ids).toEqual(['step-001'])
    })
  })

  describe('formatResolutionReport', () => {
    it('should format failed resolutions', () => {
      const report = resolveDependencies(['NonExistent'], [])
      const formatted = formatResolutionReport(report)

      expect(formatted).toContain('Failed to resolve')
      expect(formatted).toContain('NonExistent')
    })

    it('should format ambiguous resolutions', () => {
      const steps: AvailableStep[] = [
        { id: 'step-1', name: 'Setup Server', index: 0 },
      ]
      const report = resolveDependencies(['Setup Servr'], steps, { ambiguousThreshold: 0.95 })
      const formatted = formatResolutionReport(report)

      expect(formatted).toContain('Ambiguous')
      expect(formatted).toContain('confidence')
    })

    it('should return empty string when no issues', () => {
      const steps: AvailableStep[] = [
        { id: 'step-1', name: 'Setup', index: 0 },
      ]
      const report = resolveDependencies(['Setup'], steps)
      const formatted = formatResolutionReport(report)

      expect(formatted).toBe('')
    })
  })

  describe('real-world scenarios', () => {
    const workflowSteps: AvailableStep[] = [
      { id: 'step-abc123', name: 'Design database schema', index: 0 },
      { id: 'step-def456', name: 'Implement API endpoints', index: 1 },
      { id: 'step-ghi789', name: 'Write unit tests', index: 2 },
      { id: 'step-jkl012', name: 'Review code changes', index: 3 },
      { id: 'step-mno345', name: 'Deploy to staging', index: 4 },
    ]

    it('should handle AI-generated dependencies with slight variations', () => {
      // AI might generate "Design the database schema" instead of "Design database schema"
      // "Write unit tests" should match "Write unit tests"
      // "Review code" should match "Review code changes" via word matching
      const aiGenerated = ['Design the database schema', 'Write unit tests', 'Review code']
      const report = resolveDependencies(aiGenerated, workflowSteps)

      expect(report.resolved.length).toBe(3)
      expect(report.resolved.map(r => r.id)).toContain('step-abc123') // Design database schema
      expect(report.resolved.map(r => r.id)).toContain('step-ghi789') // Write unit tests
      expect(report.resolved.map(r => r.id)).toContain('step-jkl012') // Review code changes
    })

    it('should handle mixed reference styles', () => {
      // User might mix IDs, names, and indices
      const mixedRefs = ['step-abc123', 'Implement API endpoints', 'step 3']
      const report = resolveDependencies(mixedRefs, workflowSteps)

      expect(report.resolved.length).toBe(3)
      expect(report.failed.length).toBe(0)
    })

    it('should prioritize exact matches over fuzzy', () => {
      const steps: AvailableStep[] = [
        { id: 'step-1', name: 'Test', index: 0 },
        { id: 'step-2', name: 'Test Results', index: 1 },
      ]

      // "Test" should match "Test" exactly, not "Test Results"
      const result = resolveDependency('Test', steps)
      expect(result.resolvedId).toBe('step-1')
      expect(result.confidence).toBe(1.0)
      expect(result.strategy).toBe('exact_name')
    })
  })

  describe('step index fallback — array position when .index does not match', () => {
    it('should fall back to array position when no step has matching .index', () => {
      // Steps with non-sequential .index values that don't include 0
      // Names deliberately avoid "step" to prevent word/partial matching
      const stepsWithGaps: AvailableStep[] = [
        { id: 'id-a', name: 'Initialize Database', index: 10 },
        { id: 'id-b', name: 'Configure Networking', index: 20 },
        { id: 'id-c', name: 'Validate Deployment', index: 30 },
      ]

      // "step 1" → parseStepIndex returns 0 (1-based → 0)
      // No matching .index === 0, but array position 0 exists → fallback
      const result = resolveDependency('step 1', stepsWithGaps)
      expect(result.resolvedId).toBe('id-a')
      expect(result.confidence).toBe(0.8)
      expect(result.strategy).toBe('step_index')
    })

    it('should use array position for 0-based index when .index gaps exist', () => {
      const stepsWithGaps: AvailableStep[] = [
        { id: 'id-a', name: 'Initialize Database', index: 5 },
        { id: 'id-b', name: 'Configure Networking', index: 15 },
      ]

      // "step-1" → parseStepIndex returns 1 (0-based due to hyphen)
      // No matching .index === 1, but array position 1 exists → fallback
      const result = resolveDependency('step-1', stepsWithGaps)
      expect(result.resolvedId).toBe('id-b')
      expect(result.confidence).toBe(0.8)
      expect(result.strategy).toBe('step_index')
    })
  })
})
