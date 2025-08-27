import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LoggerProvider } from '../logging/index.renderer'
import '@arco-design/web-react/dist/css/arco.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoggerProvider>
      <App />
    </LoggerProvider>
  </React.StrictMode>,
)
