/**
 * JournalCalendarView — the calendar/list view of the Journal tab.
 *
 * Left: a month calendar (days with entries are dotted) + the selected day's
 * entry list with a "New entry" action. Right: the editor for the selected entry.
 * A day can hold multiple entries; selecting a new day auto-selects that day's
 * first entry (or none).
 */

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Button, Typography, Empty, Badge, Spin } from '@arco-design/web-react'
import { IconPlus } from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { useJournalStore, type JournalEntryRow } from '../../store/useJournalStore'
import { JournalLoadStatus } from '../../store/useJournalStore'
import { JournalEntryEditor } from './JournalEntryEditor'
import { logger } from '@/logger'

export function JournalCalendarView() {
  const entries = useJournalStore((s) => s.entries)
  const status = useJournalStore((s) => s.status)
  const selectedEntryId = useJournalStore((s) => s.selectedEntryId)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  const createEntry = useJournalStore((s) => s.createEntry)
  const selectEntry = useJournalStore((s) => s.selectEntry)

  const [selectedDate, setSelectedDate] = useState(() => dayjs())

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  // Entries grouped by day (YYYY-MM-DD) for fast calendar dots + day lists.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, JournalEntryRow[]>()
    for (const entry of entries) {
      const key = dayjs(entry.entryDate).format('YYYY-MM-DD')
      const list = map.get(key) ?? []
      list.push(entry)
      map.set(key, list)
    }
    return map
  }, [entries])

  const dayKey = selectedDate.format('YYYY-MM-DD')
  const dayEntries = entriesByDay.get(dayKey) ?? []
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null

  const handleSelectDay = (date: dayjs.Dayjs): void => {
    setSelectedDate(date)
    const list = entriesByDay.get(date.format('YYYY-MM-DD')) ?? []
    selectEntry(list[0]?.id ?? null)
  }

  const handleNewEntry = async (): Promise<void> => {
    try {
      await createEntry({
        entryDate: selectedDate.startOf('day').toDate(),
        title: '',
        content: '',
        plainText: '',
      })
    } catch (error) {
      logger.ui.error('Failed to create journal entry', {
        error: error instanceof Error ? error.message : String(error),
      }, 'journal-create-error')
    }
  }

  const dateRender = (current: dayjs.Dayjs): React.ReactNode => {
    const count = entriesByDay.get(current.format('YYYY-MM-DD'))?.length ?? 0
    const isSelected = current.isSame(selectedDate, 'day')
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: isSelected ? 'var(--color-primary-light-1)' : undefined,
        }}
      >
        <span style={{ fontWeight: isSelected ? 700 : 400 }}>{current.date()}</span>
        {count > 0 && (
          <Badge
            count={count}
            style={{ backgroundColor: 'rgb(var(--arcoblue-6))' }}
            dotStyle={{ marginTop: 2 }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0, padding: 16 }}>
      {/* Left: calendar + day entry list */}
      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Calendar
          dateRender={dateRender}
          onChange={handleSelectDay}
          value={selectedDate}
          panel
          panelWidth="100%"
        />
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography.Title heading={6} style={{ margin: 0 }}>
            {selectedDate.format('dddd, MMM D')}
          </Typography.Title>
          <Button type="primary" size="small" icon={<IconPlus />} onClick={handleNewEntry}>
            New entry
          </Button>
        </div>

        <div style={{ marginTop: 8, overflow: 'auto', flex: 1, minHeight: 0 }}>
          {status === JournalLoadStatus.Loading && dayEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          ) : dayEntries.length === 0 ? (
            <Empty description="No entries this day" style={{ marginTop: 24 }} />
          ) : (
            dayEntries.map((entry) => {
              const isActive = entry.id === selectedEntryId
              return (
                <div
                  key={entry.id}
                  onClick={() => selectEntry(entry.id)}
                  style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: isActive ? 'rgb(var(--arcoblue-6))' : 'var(--color-border-2)',
                    background: isActive ? 'var(--color-primary-light-1)' : 'var(--color-bg-2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Typography.Text bold ellipsis={{ rows: 1 }} style={{ flex: 1 }}>
                      {entry.title.trim().length > 0 ? entry.title : 'Untitled entry'}
                    </Typography.Text>
                    {entry.processedAt !== null && (
                      <Badge status="processing" text="" />
                    )}
                  </div>
                  <Typography.Text type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 12 }}>
                    {entry.plainText.trim().length > 0
                      ? entry.plainText
                      : 'Empty — start writing…'}
                  </Typography.Text>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {selectedEntry ? (
          <JournalEntryEditor entry={selectedEntry} />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty
              description={
                dayEntries.length > 0
                  ? 'Select an entry to edit'
                  : 'Create an entry for this day to begin'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
