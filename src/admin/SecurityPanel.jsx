import { useState } from 'react'
import { adminApi } from '../adminApi'
import { Badge, DataTable, ErrorText, Stat, formatDate, useLoad } from './ui'

const REFRESH_MS = 15000

export default function SecurityPanel() {
  const [live, setLive] = useState(true)
  const status = useLoad(() => adminApi.securityStatus(), [], live ? REFRESH_MS : 0)
  const logins = useLoad(() => adminApi.securityLogins(), [], live ? REFRESH_MS : 0)

  const s = status.data
  if (!s) return <ErrorText>{status.error}</ErrorText>
  const { authentication: auth, integrity, row_level_security: rls } = s

  return (
    <>
      <div className="admin-toolbar">
        <span className="spacer" />
        <label className="admin-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh (15 s)
        </label>
        <button
          className="admin-btn"
          type="button"
          onClick={() => {
            status.reload()
            logins.reload()
          }}
        >
          Refresh
        </button>
      </div>
      <ErrorText>{status.error || logins.error}</ErrorText>

      {s.warnings.length === 0 ? (
        <p className="admin-ok">No security warnings.</p>
      ) : (
        s.warnings.map((warning) => (
          <p className="admin-warning" key={warning}>
            ⚠ {warning}
          </p>
        ))
      )}

      <div className="admin-stats" style={{ marginTop: 16 }}>
        <Stat label="Failed logins (1 h)" value={s.logins.failed_last_hour} />
        <Stat label="Successful logins (1 h)" value={s.logins.successful_last_hour} tone="completed" />
        <Stat label="Blocked now" value={s.logins.currently_blocked.length} />
        <Stat label="Users without tenant" value={integrity.users_without_tenant} />
        <Stat label="Tenants without owner" value={integrity.tenants_without_owner} />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Authentication</h3>
          <dl className="admin-kv" style={{ marginBottom: 0 }}>
            <dt>Token</dt>
            <dd>
              JWT {auth.algorithm}, expires in {auth.token_minutes} min
            </dd>
            <dt>Signing secret</dt>
            <dd>{auth.jwt_secret_length} characters</dd>
            <dt>Master admin user</dt>
            <dd>{auth.admin_email}</dd>
            <dt>Master admin password</dt>
            <dd>
              <Badge tone={auth.admin_password_is_default ? 'amber' : 'green'}>
                {auth.admin_password_is_default ? 'default (in source code)' : 'set from environment'}
              </Badge>
            </dd>
            <dt>Login throttling</dt>
            <dd>
              {s.logins.max_failures} failures per {s.logins.window_seconds / 60} min, per account
            </dd>
            <dt>CORS origins</dt>
            <dd>{auth.cors_origins.join(', ') || '—'}</dd>
            <dt>Environment</dt>
            <dd>{auth.environment}</dd>
          </dl>
        </div>

        <div className="admin-card">
          <h3>Data integrity</h3>
          <dl className="admin-kv" style={{ marginBottom: 0 }}>
            <dt>Inactive users</dt>
            <dd>{integrity.inactive_users}</dd>
            <dt>Users without tenant</dt>
            <dd>{integrity.users_without_tenant}</dd>
            <dt>Tenants without members</dt>
            <dd>{integrity.tenants_without_members}</dd>
            <dt>Tenants without owner</dt>
            <dd>{integrity.tenants_without_owner}</dd>
            <dt>Users in several tenants</dt>
            <dd>{integrity.users_in_multiple_tenants}</dd>
          </dl>
        </div>
      </div>

      <h3 style={{ margin: '0 0 12px', fontWeight: 500 }}>Row-level security</h3>
      {rls === null ? (
        <p className="admin-muted">Could not read security policies (missing permissions).</p>
      ) : (
        <DataTable
          columns={[
            { label: 'Policy', render: (p) => p.policy },
            { label: 'Table', render: (p) => p.table },
            { label: 'Predicate', render: (p) => p.predicate },
            { label: 'State', render: (p) => <Badge tone={p.enabled ? 'green' : 'red'}>{p.enabled ? 'on' : 'off'}</Badge> },
          ]}
          rows={rls}
          rowKey={(p, i) => `${p.policy}-${p.predicate}-${i}`}
          empty="No row-level security policy is applied. Tenant isolation relies on the API filters."
        />
      )}

      <h3 style={{ margin: '28px 0 4px', fontWeight: 500 }}>Recent sign-in attempts</h3>
      <p className="admin-muted" style={{ marginTop: 0 }}>{logins.data?.note}</p>
      <DataTable
        columns={[
          { label: 'When', render: (l) => formatDate(l.at) },
          { label: 'Account', render: (l) => l.identifier },
          { label: 'Type', render: (l) => <Badge tone={l.kind === 'admin' ? 'blue' : 'neutral'}>{l.kind}</Badge> },
          { label: 'Result', render: (l) => <Badge tone={l.success ? 'green' : 'red'}>{l.success ? 'success' : 'failed'}</Badge> },
          { label: 'IP', render: (l) => <span className="admin-mono">{l.ip ?? '—'}</span> },
        ]}
        rows={logins.data?.items ?? []}
        rowKey={(l, i) => `${l.at}-${i}`}
        empty="No sign-in attempts since the API started"
      />
    </>
  )
}
