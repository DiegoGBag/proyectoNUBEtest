import { useState } from 'react'
import { adminApi } from '../adminApi'
import { Badge, BarList, ErrorText, SearchInput, Stat, formatDate, statusTone, useLoad } from './ui'

const REFRESH_MS = 30000

export default function OverviewPanel({ navigate }) {
  const [live, setLive] = useState(true)
  const [query, setQuery] = useState('')
  const { data, error, reload } = useLoad(() => adminApi.overview(), [], live ? REFRESH_MS : 0)
  const search = useLoad(() => (query ? adminApi.search(query) : Promise.resolve(null)), [query])

  if (!data) return <ErrorText>{error}</ErrorText>
  const { totals } = data
  const peak = Math.max(1, ...data.events_by_month.map((month) => month.total))
  const results = search.data

  return (
    <>
      <div className="admin-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tenants, users or events…" />
        <span className="spacer" />
        <label className="admin-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh (30 s)
        </label>
        <button className="admin-btn" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <ErrorText>{error || search.error}</ErrorText>

      {results && (
        <div className="admin-search-results">
          <div className="admin-card">
            <h3>Tenants</h3>
            <ul className="admin-list">
              {results.tenants.map((tenant) => (
                <li key={tenant.tenant_id}>
                  <button
                    className="admin-link"
                    type="button"
                    onClick={() => navigate('tenants', { q: tenant.name })}
                  >
                    {tenant.name}
                  </button>
                  <span>{tenant.slug}</span>
                </li>
              ))}
              {results.tenants.length === 0 && <li className="admin-muted">No matches</li>}
            </ul>
          </div>
          <div className="admin-card">
            <h3>Users</h3>
            <ul className="admin-list">
              {results.users.map((user) => (
                <li key={user.user_id}>
                  <button className="admin-link" type="button" onClick={() => navigate('users', { q: user.email })}>
                    {user.full_name}
                  </button>
                  <span>{user.email}</span>
                </li>
              ))}
              {results.users.length === 0 && <li className="admin-muted">No matches</li>}
            </ul>
          </div>
          <div className="admin-card">
            <h3>Events</h3>
            <ul className="admin-list">
              {results.events.map((event) => (
                <li key={event.event_id}>
                  <button className="admin-link" type="button" onClick={() => navigate('events', { q: event.name })}>
                    {event.name}
                  </button>
                  <span>{event.tenant_name}</span>
                </li>
              ))}
              {results.events.length === 0 && <li className="admin-muted">No matches</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="admin-stats">
        <Stat label="Tenants" value={totals.tenants} />
        <Stat label="Users" value={totals.users} tone="upcoming" />
        <Stat label="Active users" value={totals.active_users} tone="completed" />
        <Stat label="Events" value={totals.events} />
        <Stat label="Upcoming" value={totals.upcoming_events} tone="upcoming" />
        <Stat label="Completed" value={totals.completed_events} tone="completed" />
        <Stat label="Categories" value={totals.categories} />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Events by month</h3>
          {data.events_by_month.length === 0 ? (
            <p className="admin-muted">No events yet</p>
          ) : (
            <div className="admin-months">
              {data.events_by_month.map((month) => (
                <div className="col" key={month.month} title={`${month.total} events`}>
                  {month.total}
                  <span className="bar" style={{ height: `${(month.total / peak) * 100}%` }} />
                  {month.month.slice(2)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="admin-card">
          <h3>Events by category</h3>
          <BarList items={data.events_by_category} labelKey="category" valueKey="count" />
        </div>
        <div className="admin-card">
          <h3>Events by status</h3>
          <BarList items={data.events_by_status} labelKey="status" valueKey="count" tone="green" />
        </div>
        <div className="admin-card">
          <h3>Top tenants by events</h3>
          <BarList items={data.top_tenants} labelKey="name" valueKey="events" />
        </div>
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Recent users</h3>
          <ul className="admin-list">
            {data.recent_users.map((user) => (
              <li key={user.user_id}>
                <span style={{ color: 'inherit', fontSize: 'inherit' }}>
                  {user.full_name} <span className="admin-muted">{user.email}</span>
                </span>
                <span>{formatDate(user.created_at, false)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="admin-card">
          <h3>Recent events</h3>
          <ul className="admin-list">
            {data.recent_events.map((event) => (
              <li key={event.event_id}>
                <span style={{ color: 'inherit', fontSize: 'inherit' }}>
                  {event.name} <span className="admin-muted">{event.tenant_name}</span>
                </span>
                <Badge tone={statusTone[event.status]}>{event.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="admin-muted">Updated {formatDate(data.generated_at)}</p>
    </>
  )
}
