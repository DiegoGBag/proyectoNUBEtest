import { useState } from 'react'
import '../App.css'
import './admin.css'
import ActivityPanel from './ActivityPanel'
import CategoriesPanel from './CategoriesPanel'
import DatabasePanel from './DatabasePanel'
import EventsPanel from './EventsPanel'
import OverviewPanel from './OverviewPanel'
import SecurityPanel from './SecurityPanel'
import TenantsPanel from './TenantsPanel'
import UsersPanel from './UsersPanel'

const ICONS = {
  overview: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
  tenants: <path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1M3 21h18" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  categories: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  activity: <path d="M2 12h4l3-8 5 16 3-8h5" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  security: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4" />,
}

function Icon({ name }) {
  return (
    <svg
      className="admin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

const TABS = [
  ['overview', 'Overview', OverviewPanel],
  ['tenants', 'Tenants', TenantsPanel],
  ['users', 'Users', UsersPanel],
  ['events', 'Events', EventsPanel],
  ['categories', 'Categories', CategoriesPanel],
  ['activity', 'Activity', ActivityPanel],
  ['database', 'Database', DatabasePanel],
  ['security', 'Security', SecurityPanel],
]

function AdminApp({ onLogout }) {
  // `filters` permite saltar de un panel a otro ya filtrado (p. ej. eventos de un usuario).
  const [view, setView] = useState({ tab: 'overview', filters: {}, nonce: 0 })

  const navigate = (tab, filters = {}) =>
    setView((current) => ({ tab, filters, nonce: current.nonce + 1 }))

  const [, , Panel] = TABS.find(([id]) => id === view.tab)

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <p className="admin-brand">Control Admin</p>
        <nav className="admin-nav" aria-label="Administration sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={id === view.tab ? 'active' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon name={id} />
              {label}
            </button>
          ))}
        </nav>
        <p className="admin-tagline">
          Plan Every Event
          <br />
          With <strong>Confidence</strong>
        </p>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>Control Admin</h1>
            <p>Monitor and manage every tenant, user and event</p>
          </div>
          <div className="admin-session">
            <span className="admin-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="9" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
              </svg>
            </span>
            <div className="who">
              <strong>admin-d</strong>
              <span>Master administrator</span>
            </div>
            <button className="cancel-button admin-logout" type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        <Panel key={`${view.tab}-${view.nonce}`} initialFilters={view.filters} navigate={navigate} />
      </main>
    </div>
  )
}

export default AdminApp
