import React from 'react'
import ReactDOM from 'react-dom/client'
import { setLogLevel, LogLevel } from 'livekit-client'
import App from './App.tsx'

// Supports weights 100-700
import '@fontsource-variable/material-symbols-outlined'

// Silence LiveKit's verbose default logger before any Room/Track code runs.
setLogLevel(LogLevel.warn)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
