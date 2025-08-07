import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { ConfigProvider } from '@arco-design/web-react'
import enUS from '@arco-design/web-react/es/locale/en-US'

// Custom render function that includes providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ConfigProvider locale={enUS}>
        {children}
      </ConfigProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}

// re-export everything
export * from '@testing-library/react'
export { customRender as render }
