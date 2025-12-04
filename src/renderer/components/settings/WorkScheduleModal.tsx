import { Modal } from '@arco-design/web-react'
import { MultiDayScheduleEditor } from './MultiDayScheduleEditor'

interface WorkScheduleModalProps {
  visible: boolean
  date?: string
  onClose: () => void
  onSave?: () => void
}

export function WorkScheduleModal({
  visible,
  date: _date,
  onClose,
  onSave: _onSave,
}: WorkScheduleModalProps) {
  return (
    <Modal
      title="Work Schedule Manager"
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: '95%', maxWidth: 1400, top: 20 }}
      maskClosable={false}
    >
      <div style={{ height: '80vh', overflow: 'auto' }}>
        <MultiDayScheduleEditor visible={true} onClose={onClose} />
      </div>
    </Modal>
  )
}
