import { useState } from 'react'
import { adminApi } from '../adminApi'
import { ACTION_OPTIONS, ActivityTable, ErrorText, PAGE_SIZE, Pager, useLoad } from './ui'

const REFRESH_MS = 30000

// Actividad de todos los usuarios de todos los tenants (inicios de sesion, consultas, bloqueos).
export default function ActivityPanel({ initialFilters }) {
  const [tenantId, setTenantId] = useState(initialFilters.tenant_id ?? '')
  const [action, setAction] = useState('')
  const [live, setLive] = useState(true)
  const [offset, setOffset] = useState(0)
  const feed = useLoad(
    () => adminApi.activity({ tenant_id: tenantId, action, limit: PAGE_SIZE, offset }),
    [tenantId, action, offset],
    live ? REFRESH_MS : 0,
  )
  const tenants = useLoad(() => adminApi.tenants({ limit: 200 }), [])

  const filter = (setter) => (value) => {
    setter(value)
    setOffset(0)
  }

  return (
    <>
      <div className="admin-toolbar">
        <select className="admin-select admin-input" value={tenantId} onChange={(e) => filter(setTenantId)(e.target.value)}>
          <option value="">All tenants</option>
          {(tenants.data?.items ?? []).map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 260 }} value={action} onChange={(e) => filter(setAction)(e.target.value)}>
          <option value="">All activity</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <label className="admin-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh (30 s)
        </label>
        <button className="admin-btn" type="button" onClick={feed.reload}>
          Refresh
        </button>
      </div>
      <ErrorText>{feed.error}</ErrorText>
      <ActivityTable items={feed.data?.items ?? []} showTenant />
      <Pager total={feed.data?.total} offset={offset} onChange={setOffset} />
    </>
  )
}
