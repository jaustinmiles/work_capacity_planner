/**
 * TradeoffMatrix — Pro/con grid showing options as columns.
 * All content from the user's own words — Claude never generates pro/con text.
 * Ported from Decision Helper's ProConMatrix.jsx.
 */

import React from 'react'
import { Typography } from '@arco-design/web-react'
import type { DecisionOption, DecisionFactor } from '@shared/decision-types'

const { Text } = Typography

interface TradeoffMatrixProps {
  options: DecisionOption[]
  factors: DecisionFactor[]
}

export function TradeoffMatrix({ options, factors }: TradeoffMatrixProps): React.ReactElement {
  const empty = options.length === 0

  return (
    <div style={{ background: 'var(--color-bg-1)', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>▦</span>
        <Text bold>Tradeoff Matrix</Text>
      </div>

      {empty ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
          Options and tradeoffs will appear as you talk through them
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: 8 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `100px repeat(${options.length}, 1fr)`,
              gap: 1,
              fontSize: 12,
            }}
          >
            {/* Header */}
            <div />
            {options.map(opt => (
              <div key={opt.id} style={{ padding: 6, fontWeight: 600, textAlign: 'center', color: '#6366f1' }}>
                {opt.label}
              </div>
            ))}

            {/* Pros */}
            <div style={{ padding: 6, fontWeight: 600, color: '#10b981' }}>Pros</div>
            {options.map(opt => (
              <div key={`pro-${opt.id}`} style={{ padding: 6 }}>
                {opt.pros.length > 0 ? opt.pros.map((p, i) => (
                  <div key={i} style={{ color: 'var(--color-text-2)', marginBottom: 2 }}>
                    <span style={{ color: '#10b981' }}>+</span> {p}
                  </div>
                )) : (
                  <span style={{ color: 'var(--color-text-4)' }}>—</span>
                )}
              </div>
            ))}

            {/* Cons */}
            <div style={{ padding: 6, fontWeight: 600, color: '#ef4444' }}>Cons</div>
            {options.map(opt => (
              <div key={`con-${opt.id}`} style={{ padding: 6 }}>
                {opt.cons.length > 0 ? opt.cons.map((c, i) => (
                  <div key={i} style={{ color: 'var(--color-text-2)', marginBottom: 2 }}>
                    <span style={{ color: '#ef4444' }}>−</span> {c}
                  </div>
                )) : (
                  <span style={{ color: 'var(--color-text-4)' }}>—</span>
                )}
              </div>
            ))}
          </div>

          {/* Factors */}
          {factors.length > 0 && (
            <div style={{ padding: '8px 6px', borderTop: '1px solid var(--color-border)' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Factors</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {factors.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'var(--color-fill-2)', borderRadius: 4, padding: '2px 8px' }}>
                    <span>{f.name}</span>
                    <div style={{ width: 40, height: 4, background: 'var(--color-fill-3)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${(f.weight || 0.5) * 100}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
