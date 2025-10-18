import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@arco-design/web-react/dist/css/arco.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* LOGGER_REMOVED: LoggerProvider */}

      <App />

  </React.StrictMode>,
)
