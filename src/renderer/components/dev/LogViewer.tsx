import { Typography, Card, Empty } from '@arco-design/web-react'

const { Title } = Typography

interface LogViewerProps {
  onClose: () => void
}

export function LogViewer({ onClose: _onClose }: LogViewerProps) {
  return (
    <Card
      title={
        <Title heading={6}>Log Viewer</Title>
      }
    >
      <Empty
        description="Logging system is being rebuilt. Check back soon!"
        style={{ padding: '40px 0' }}
      />
    </Card>
  )
}
