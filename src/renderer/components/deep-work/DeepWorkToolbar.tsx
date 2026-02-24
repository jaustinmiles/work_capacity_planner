/**
 * DeepWorkToolbar — Board management toolbar for the Deep Work Board.
 *
 * Shows board name (editable), board switcher, import button, and toggle controls.
 */

import { useState, useCallback } from 'react'
import { Button, Space, Input, Select, Divider } from '@arco-design/web-react'
import { IconPlus, IconImport, IconMenuFold, IconMenuUnfold } from '@arco-design/web-react/icon'
import { useDeepWorkBoardStore, BoardLoadStatus } from '../../store/useDeepWorkBoardStore'
import { SprintImporter } from './SprintImporter'

export function DeepWorkToolbar() {
  const boards = useDeepWorkBoardStore((s) => s.boards)
  const activeBoardId = useDeepWorkBoardStore((s) => s.activeBoardId)
  const activeBoard = useDeepWorkBoardStore((s) => s.activeBoard)
  const status = useDeepWorkBoardStore((s) => s.status)
  const actionPanelOpen = useDeepWorkBoardStore((s) => s.actionPanelOpen)
  const createBoard = useDeepWorkBoardStore((s) => s.createBoard)
  const switchBoard = useDeepWorkBoardStore((s) => s.switchBoard)
  const updateBoardName = useDeepWorkBoardStore((s) => s.updateBoardName)
  const toggleActionPanel = useDeepWorkBoardStore((s) => s.toggleActionPanel)

  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [showImporter, setShowImporter] = useState(false)

  const handleStartEditName = useCallback(() => {
    setEditName(activeBoard?.name ?? '')
    setIsEditingName(true)
  }, [activeBoard])

  const handleConfirmName = useCallback(async () => {
    if (editName.trim()) {
      await updateBoardName(editName.trim())
    }
    setIsEditingName(false)
  }, [editName, updateBoardName])

  const handleCreateBoard = useCallback(async () => {
    const id = await createBoard('New Board')
    await switchBoard(id)
  }, [createBoard, switchBoard])

  const handleOpenImporter = useCallback(() => {
    setShowImporter(true)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid #e5e6eb',
        background: '#fff',
        gap: 12,
        minHeight: 48,
      }}
    >
      {/* Board name */}
      {isEditingName ? (
        <Input
          size="small"
          value={editName}
          onChange={setEditName}
          onPressEnter={handleConfirmName}
          onBlur={handleConfirmName}
          autoFocus
          style={{ width: 180, fontWeight: 600 }}
        />
      ) : (
        <span
          onClick={handleStartEditName}
          style={{
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            minWidth: 80,
          }}
          title="Click to rename"
        >
          {activeBoard?.name ?? 'Deep Work Board'}
        </span>
      )}

      {/* Board switcher */}
      {boards.length > 1 && (
        <Select
          size="small"
          value={activeBoardId ?? undefined}
          onChange={(val) => switchBoard(val as string)}
          style={{ width: 160 }}
          loading={status === BoardLoadStatus.Loading}
        >
          {boards.map((board) => (
            <Select.Option key={board.id} value={board.id}>
              {board.name}
            </Select.Option>
          ))}
        </Select>
      )}

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* Actions */}
      <Space size="small">
        <Button
          size="small"
          icon={<IconPlus />}
          onClick={handleCreateBoard}
        >
          New Board
        </Button>
        <Button
          size="small"
          icon={<IconImport />}
          onClick={handleOpenImporter}
          disabled={!activeBoardId}
        >
          Import Sprint
        </Button>
      </Space>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Action panel toggle */}
      <Button
        size="small"
        type="text"
        icon={actionPanelOpen ? <IconMenuFold /> : <IconMenuUnfold />}
        onClick={toggleActionPanel}
        title={actionPanelOpen ? 'Hide action panel' : 'Show action panel'}
      />

      {/* Sprint importer dialog */}
      <SprintImporter
        visible={showImporter}
        onClose={() => setShowImporter(false)}
      />
    </div>
  )
}
