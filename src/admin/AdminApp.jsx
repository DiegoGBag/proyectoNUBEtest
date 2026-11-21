import { useState } from 'react'
import '../App.css'
import Shell from '../Shell'
import './admin.css'
import ActivityPanel from './ActivityPanel'
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
  ['activity', 'Activity', ActivityPanel],
  ['database', 'Database', DatabasePanel],
  ['security', 'Security', SecurityPanel],
]

function AdminApp({ onLogout }) {
  // `filters` permite saltar de un panel a otro ya filtrado (p. ej. eventos de un usuario).
  const [view, setView] = useState({ tab: 'overview', filters: {}, nonce: 0 })

  const navigate = (tab, filters = {}) =>
    setView((current) => ({ tab, filters, nonce: current.nonce + 1 }))

  const [, label, Panel] = TABS.find(([id]) => id === view.tab)
  const nav = TABS.map(([id, tabLabel]) => ({ id, label: tabLabel, icon: id }))

  return (
    <Shell
      brand="Control Admin"
      nav={nav}
      active={view.tab}
      onNavigate={(id) => navigate(id)}
      title={view.tab === 'overview' ? 'Control Admin' : label}
      subtitle="Monitor and manage every tenant, user and event"
      user={{ name: 'admin-d', lines: ['Master administrator'] }}
      onLogout={onLogout}
    >
      <Panel key={`${view.tab}-${view.nonce}`} initialFilters={view.filters} navigate={navigate} />
    </Shell>
  )
}

export default AdminApp
