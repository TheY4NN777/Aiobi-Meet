import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { setLogLevel, LogLevel } from 'livekit-client'
import App from './App.tsx'

// Supports weights 100-700
import '@fontsource-variable/material-symbols-outlined'

// Silence LiveKit's verbose default logger before any Room/Track code runs.
setLogLevel(LogLevel.warn)

// Sentry/GlitchTip — initialisation conditionnelle.
// Si le DSN n'est pas injecté au build (VITE_GLITCHTIP_DSN_FRONTEND vide),
// init() est skippé — aucun appel réseau, aucune instrumentation, zero impact.
// Une fois le DSN configuré côté CI et le frontend re-buildé, les erreurs JS
// non gérées sont envoyées à GlitchTip via le proxy /glitchtip/api/ du nginx.
const glitchtipDsn = import.meta.env.VITE_GLITCHTIP_DSN_FRONTEND
if (glitchtipDsn) {
  Sentry.init({
    dsn: glitchtipDsn,
    environment: import.meta.env.MODE,
    // 10% des traces de perf — suffit pour voir les tendances sans submerger
    // GlitchTip en cas de pic de trafic.
    tracesSampleRate: 0.1,
    // Pas de session replay en phase 1 (privacy en visio + poids bundle).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
