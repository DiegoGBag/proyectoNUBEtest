import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { APP_ENV } from './api.js'

// Fuera de produccion se marca la pestana y se muestra una cinta, para no confundir
// el sitio de pruebas (o local) con el real.
if (APP_ENV !== 'production') {
  const label = APP_ENV === 'test' ? 'PRUEBAS' : 'LOCAL'
  document.title = `[${label}] ${document.title}`
  const badge = document.createElement('div')
  badge.textContent = `Entorno: ${label}`
  badge.style.cssText =
    'position:fixed;bottom:8px;right:8px;z-index:99999;padding:4px 10px;border-radius:6px;' +
    'background:#f59e0b;color:#111;font:600 12px system-ui,sans-serif;opacity:.9;pointer-events:none'
  document.body.appendChild(badge)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
