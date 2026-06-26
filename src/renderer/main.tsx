import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { registerCommandBridge } from './state/mcpBridge'
import './app/global.css'

// Let the MCP server (and external agents) drive the editor through this window.
registerCommandBridge()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
