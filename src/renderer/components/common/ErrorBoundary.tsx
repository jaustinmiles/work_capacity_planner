import { Component, ErrorInfo, ReactNode } from 'react'
import { Result, Button, Typography, Space } from '@arco-design/web-react'
import { IconRefresh, IconBug } from '@arco-design/web-react/icon'
// LOGGER_REMOVED: import { logger } from '@/shared/logger'


const { Paragraph, Text } = Typography

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // LOGGER_REMOVED: logger.ui.error('Error caught by boundary:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{ padding: '40px 20px', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Result
            status="error"
            icon={<IconBug style={{ fontSize: 48 }} />}
            title="Something went wrong"
            subTitle="An unexpected error occurred. The error details are shown below."
            extra={
              <Space>
                <Button type="primary" icon={<IconRefresh />} onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </Space>
            }
          >
            {process.env.NODE_ENV === 'development' && (
              <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 600 }}>
                <Paragraph>
                  <Text type="error" style={{ fontWeight: 600 }}>Error:</Text> {this.state.error?.message}
                </Paragraph>
                {this.state.errorInfo && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ cursor: 'pointer', color: '#86909c' }}>
                      Component Stack Trace
                    </summary>
                    <pre style={{
                      marginTop: 8,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 4,
                      fontSize: 12,
                      overflow: 'auto',
                      maxHeight: 200,
                    }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </Result>
        </div>
      )
    }

    return this.props.children
  }
}
