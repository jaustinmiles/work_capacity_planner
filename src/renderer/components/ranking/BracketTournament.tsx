/**
 * BracketTournament — Traditional single-elimination tournament UI.
 *
 * Renders N items (N a power of 2) as a sports-style bracket. Each round
 * is a column. Each match has two slots; the user clicks the winner.
 * Click an already-decided match to change the winner (cascade-resets
 * downstream matches). Equal counts as "skip" — neither advances.
 */

import { useMemo, useState, useEffect } from 'react'
import { Button, Typography, Tag } from '@arco-design/web-react'
import { ComparisonType } from '@/shared/constants'
import type { ComparisonResult, ItemId } from '../../utils/comparison-graph'
import { getItemLabel, type TournamentItem } from './tournament-utils'

const { Text } = Typography

interface BracketMatch {
  round: number
  position: number
  itemA: ItemId | null
  itemB: ItemId | null
  // 'equal' means both eliminated (no advance). null means undecided.
  winner: ItemId | 'equal' | null
}

interface BracketTournamentProps {
  items: TournamentItem[]
  initialPairs: Array<[ItemId, ItemId]>
  dimension: ComparisonType
  comparisons: ComparisonResult[]
  onPick: (winner: ItemId | 'equal', a: ItemId, b: ItemId) => void
  onComplete?: () => void
  isCompact?: boolean
}

/**
 * Look up the previously-recorded winner (if any) for a pair in the active
 * dimension. Returns 'equal' / a winner id / null.
 */
function recordedWinner(
  pair: [ItemId, ItemId],
  dim: ComparisonType,
  comparisons: ComparisonResult[],
): ItemId | 'equal' | null {
  const c = comparisons.find(c =>
    (c.itemA === pair[0] && c.itemB === pair[1]) ||
    (c.itemA === pair[1] && c.itemB === pair[0]),
  )
  if (!c) return null
  return dim === ComparisonType.Priority ? c.higherPriority : c.higherUrgency
}

/**
 * Build the full bracket from initial pairs + the comparison graph.
 * Each round derives from the winners of the previous round.
 */
function buildBracket(
  initialPairs: Array<[ItemId, ItemId]>,
  dim: ComparisonType,
  comparisons: ComparisonResult[],
): BracketMatch[][] {
  if (initialPairs.length === 0) return []
  const numItems = initialPairs.length * 2
  const numRounds = Math.round(Math.log2(numItems))
  const rounds: BracketMatch[][] = []

  // Round 0
  const round0: BracketMatch[] = initialPairs.map((pair, p) => ({
    round: 0,
    position: p,
    itemA: pair[0],
    itemB: pair[1],
    winner: recordedWinner(pair, dim, comparisons),
  }))
  rounds.push(round0)

  // Subsequent rounds derive from winners of the previous round.
  for (let r = 1; r < numRounds; r++) {
    const prev = rounds[r - 1]!
    const matches: BracketMatch[] = []
    for (let p = 0; p < prev.length / 2; p++) {
      const matchA = prev[2 * p]!
      const matchB = prev[2 * p + 1]!
      const itemA = matchA.winner && matchA.winner !== 'equal' ? matchA.winner : null
      const itemB = matchB.winner && matchB.winner !== 'equal' ? matchB.winner : null
      const winner = itemA && itemB
        ? recordedWinner([itemA, itemB], dim, comparisons)
        : null
      matches.push({ round: r, position: p, itemA, itemB, winner })
    }
    rounds.push(matches)
  }
  return rounds
}

/**
 * The active match is the first match (lowest round, then lowest position)
 * with both slots filled but no winner yet.
 */
function findActiveMatch(rounds: BracketMatch[][]): BracketMatch | null {
  for (const round of rounds) {
    for (const m of round) {
      if (m.itemA !== null && m.itemB !== null && m.winner === null) return m
    }
  }
  return null
}

function isTournamentComplete(rounds: BracketMatch[][]): boolean {
  if (rounds.length === 0) return false
  // Tournament is complete if every match either has a winner or has at
  // least one missing slot (which means an upstream 'equal' eliminated it).
  for (const round of rounds) {
    for (const m of round) {
      if (m.itemA !== null && m.itemB !== null && m.winner === null) return false
    }
  }
  return true
}

export function BracketTournament({
  items,
  initialPairs,
  dimension,
  comparisons,
  onPick,
  onComplete,
  isCompact = false,
}: BracketTournamentProps) {
  const titleById = useMemo(() => new Map(items.map(i => [i.id, getItemLabel(i)])), [items])

  const rounds = useMemo(
    () => buildBracket(initialPairs, dimension, comparisons),
    [initialPairs, dimension, comparisons],
  )
  const activeMatch = useMemo(() => findActiveMatch(rounds), [rounds])
  const complete = useMemo(() => isTournamentComplete(rounds), [rounds])

  // Fire onComplete exactly once when the bracket finishes.
  const [hasFiredComplete, setHasFiredComplete] = useState(false)
  useEffect(() => {
    if (complete && !hasFiredComplete) {
      setHasFiredComplete(true)
      onComplete?.()
    }
    if (!complete && hasFiredComplete) setHasFiredComplete(false)
  }, [complete, hasFiredComplete, onComplete])

  const roundLabel = (r: number, totalRounds: number): string => {
    if (r === totalRounds - 1) return 'Final'
    if (r === totalRounds - 2) return 'Semifinal'
    if (r === totalRounds - 3) return 'Quarterfinal'
    return `Round ${r + 1}`
  }

  if (rounds.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#86909C' }}>
        No tournament to display.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: isCompact ? 12 : 24,
        padding: isCompact ? 8 : 16,
        overflowX: 'auto',
        height: '100%',
        minHeight: 320,
      }}
    >
      {rounds.map((round, rIdx) => (
        <div
          key={rIdx}
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
            minWidth: isCompact ? 180 : 220,
            flex: '0 0 auto',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#86909C',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {roundLabel(rIdx, rounds.length)}
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              gap: 8,
            }}
          >
            {round.map(match => (
              <MatchCard
                key={`${match.round}-${match.position}`}
                match={match}
                titleById={titleById}
                isActive={activeMatch === match}
                onPick={onPick}
                isCompact={isCompact}
              />
            ))}
          </div>
        </div>
      ))}
      {complete && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 140,
            padding: 16,
            background: '#F6FFED',
            border: '2px solid #00B42A',
            borderRadius: 8,
            color: '#137C31',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, marginBottom: 4 }}>🏆 Winner</div>
          <div style={{ fontSize: 14 }}>
            {(() => {
              const finalMatch = rounds[rounds.length - 1]?.[0]
              if (!finalMatch || finalMatch.winner === null || finalMatch.winner === 'equal') {
                return '—'
              }
              return titleById.get(finalMatch.winner) ?? finalMatch.winner
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Match card
// ─────────────────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: BracketMatch
  titleById: Map<ItemId, string>
  isActive: boolean
  onPick: (winner: ItemId | 'equal', a: ItemId, b: ItemId) => void
  isCompact: boolean
}

function MatchCard({ match, titleById, isActive, onPick, isCompact }: MatchCardProps) {
  const { itemA, itemB, winner } = match
  const isDecided = winner !== null && winner !== 'equal'
  const isEqual = winner === 'equal'
  const isPending = itemA === null || itemB === null

  const cardBg = isActive ? '#FFF7E6' : isDecided || isEqual ? '#F7F8FA' : '#FFFFFF'
  const cardBorder = isActive ? '#FF7D00' : '#E5E6EB'
  const cardBorderWidth = isActive ? 2 : 1

  return (
    <div
      style={{
        background: cardBg,
        border: `${cardBorderWidth}px solid ${cardBorder}`,
        borderRadius: 6,
        boxShadow: isActive ? '0 0 0 3px rgba(255, 125, 0, 0.12)' : undefined,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Slot
        id={itemA}
        title={itemA ? titleById.get(itemA) ?? itemA : null}
        isWinner={winner !== null && winner === itemA}
        isLoser={isDecided && winner !== itemA}
        isPending={itemA === null}
        canPick={!isPending}
        onClick={() => {
          if (itemA && itemB) onPick(itemA, itemA, itemB)
        }}
        isCompact={isCompact}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 0',
          background: '#FFFFFF',
          borderTop: '1px solid #F2F3F5',
          borderBottom: '1px solid #F2F3F5',
        }}
      >
        {isPending ? (
          <Text style={{ fontSize: 10, color: '#C9CDD4' }}>vs</Text>
        ) : (
          <Button
            size="mini"
            type="text"
            disabled={isPending}
            style={{
              fontSize: 10,
              height: 18,
              padding: '0 8px',
              color: isEqual ? '#00B42A' : '#86909C',
              fontWeight: isEqual ? 600 : 400,
            }}
            onClick={() => {
              if (itemA && itemB) onPick('equal', itemA, itemB)
            }}
          >
            {isEqual ? '= equal' : '= mark equal'}
          </Button>
        )}
      </div>
      <Slot
        id={itemB}
        title={itemB ? titleById.get(itemB) ?? itemB : null}
        isWinner={winner !== null && winner === itemB}
        isLoser={isDecided && winner !== itemB}
        isPending={itemB === null}
        canPick={!isPending}
        onClick={() => {
          if (itemA && itemB) onPick(itemB, itemA, itemB)
        }}
        isCompact={isCompact}
      />
    </div>
  )
}

interface SlotProps {
  id: ItemId | null
  title: string | null
  isWinner: boolean
  isLoser: boolean
  isPending: boolean
  canPick: boolean
  onClick: () => void
  isCompact: boolean
}
function Slot({ title, isWinner, isLoser, isPending, canPick, onClick, isCompact }: SlotProps) {
  const bg = isWinner ? '#E8F3FF' : '#FFFFFF'
  const fg = isPending ? '#C9CDD4' : isLoser ? '#86909C' : '#1D2129'
  const fontWeight = isWinner ? 700 : 500
  const textDecoration = isLoser ? 'line-through' : 'none'
  const leftBar = isWinner ? '#3491FA' : 'transparent'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canPick}
      style={{
        background: bg,
        border: 'none',
        borderLeft: `3px solid ${leftBar}`,
        padding: isCompact ? '6px 8px' : '8px 10px',
        textAlign: 'left',
        cursor: canPick ? 'pointer' : 'default',
        color: fg,
        fontWeight,
        textDecoration,
        fontSize: isCompact ? 12 : 13,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background 0.15s ease',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (canPick && !isWinner) e.currentTarget.style.background = '#F2F3F5'
      }}
      onMouseLeave={(e) => {
        if (canPick && !isWinner) e.currentTarget.style.background = bg
      }}
    >
      {isPending ? <Tag size="small" color="gray">?</Tag> : title}
    </button>
  )
}
