/**
 * JournalView — the Journal tab root. Switches between the two surfaces:
 *  - Calendar: write/edit rich-text entries tied to days.
 *  - Scene: the AI-processed, artistic mind map of all entries.
 *
 * Owns the mode toggle; the active mode lives in the journal store so other actions
 * (e.g. "Process into mind map") can switch the user to the scene.
 */

import { Radio, Typography } from '@arco-design/web-react'
import { IconCalendar, IconMindMapping } from '@arco-design/web-react/icon'
import { JournalViewMode } from '@shared/enums'
import { useJournalStore } from '../../store/useJournalStore'
import { JournalCalendarView } from './JournalCalendarView'
import { MindMapSceneView } from './MindMapSceneView'

import './journal.css'

export function JournalView() {
  const viewMode = useJournalStore((s) => s.viewMode)
  const setViewMode = useJournalStore((s) => s.setViewMode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-border-2)',
          flexShrink: 0,
        }}
      >
        <Typography.Title heading={5} style={{ margin: 0 }}>
          Journal
        </Typography.Title>
        <Radio.Group
          type="button"
          value={viewMode}
          onChange={(value) => setViewMode(value as JournalViewMode)}
        >
          <Radio value={JournalViewMode.Calendar}>
            <IconCalendar /> Calendar
          </Radio>
          <Radio value={JournalViewMode.Scene}>
            <IconMindMapping /> Mind map
          </Radio>
        </Radio.Group>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {viewMode === JournalViewMode.Calendar ? <JournalCalendarView /> : <MindMapSceneView />}
      </div>
    </div>
  )
}
