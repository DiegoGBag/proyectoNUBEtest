import { useState } from 'react'
import '../App.css'
import './admin.css'
import CategoriesPanel from './CategoriesPanel'
import DatabasePanel from './DatabasePanel'
import EventsPanel from './EventsPanel'
import OverviewPanel from './OverviewPanel'
import SecurityPanel from './SecurityPanel'
import TenantsPanel from './TenantsPanel'
import UsersPanel from './UsersPanel'

const TABS = [
  ['overview', 'Overview', OverviewPanel],
  ['tenants', 'Tenants', TenantsPanel],
  ['users', 'Users', UsersPanel],
  ['events', 'Events', EventsPanel],
  ['categories', 'Categories', CategoriesPanel],
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
    <main className="dashboard admin-dashboard">
      <header className="admin-header">
        <div>
          <h1>Master administration</h1>
          <p>Monitor and manage every tenant, user and event</p>
        </div>
        <div className="admin-session">
          <div className="who">
            <strong>admin-d</strong>
            <span>Master administrator</span>
          </div>
          <button className="cancel-button" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Administration sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === view.tab ? 'active' : undefined}
            onClick={() => navigate(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <Panel key={`${view.tab}-${view.nonce}`} initialFilters={view.filters} navigate={navigate} />
    </main>
  )
}

export default AdminApp
