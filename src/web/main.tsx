/**
 * Web client entry point
 *
 * This is the browser-based entry point for the Task Planner.
 * It mounts the same React App component used by Electron, but
 * without any Electron-specific dependencies.
 *
 * Configuration is injected via window.appConfig in index.html
 * instead of the Electron preload script.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../renderer/App'
import '@arco-design/web-react/dist/css/arco.css'
import '../renderer/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
