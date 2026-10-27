import { useState } from 'react'
import { adminApi } from '../adminApi'
import {
  ActivityTable,
  Badge,
  DataTable,
  ErrorText,
  Modal,
  PAGE_SIZE,
  Pager,
  SearchInput,
  formatDate,
  statusTone,
  useAction,
  useLoad,
} from './ui'

const ROLES = ['owner', 'admin', 'member']
const NEW_TENANT = '__new__'

export default function UsersPanel({ initialFilters, navigate }) {
  const [q, setQ] = useState(initialFilters.q ?? '')
  const [tenantId, setTenantId] = useState(initialFilters.tenant_id ?? '')
  const [active, setActive] = useState('')
  const [role, setRole] = useState(initialFilters.role_name ?? '')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState(null) // 'new' | user
  const [detailId, setDetailId] = useState(null)
  const { data, error, reload } = useLoad(
    () => adminApi.users({ q, tenant_id: tenantId, role_name: role, is_active: active, limit: PAGE_SIZE, offset }),
    [q, tenantId, role, active, offset],
  )
  const tenants = useLoad(() => adminApi.tenants({ limit: 200 }), [])
  const remove = useAction()

  const filter = (setter) => (value) => {
    setter(value)
    setOffset(0)
  }

  const deleteUser = async (user) => {
    const ok = window.confirm(
      `Delete ${user.full_name}?\n\nThis also deletes the ${user.event_count} events they created.`,
    )
    if (ok && (await remove.run(() => adminApi.deleteUser(user.user_id)))) reload()
  }

  const columns = [
    { label: 'User', render: (u) => <strong>{u.full_name}</strong> },
    { label: 'Email', render: (u) => u.email },
    {
      label: 'Tenant',
      render: (u) =>
        u.tenants.length === 0 ? (
          <Badge tone="red">none</Badge>
        ) : (
          <div>
            {u.tenants.map((t) => (
              <div key={t.tenant_id}>
                {t.tenant_name} <Badge>{t.role_name}</Badge>
                <div className="admin-mono admin-muted">{t.tenant_id}</div>
              </div>
            ))}
          </div>
        ),
    },
    { label: 'Events', render: (u) => u.event_count },
    {
      label: 'Status',
      render: (u) => <Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'active' : 'inactive'}</Badge>,
    },
    { label: 'Created', render: (u) => formatDate(u.created_at, false) },
    {
      label: '',
      render: (u) => (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          <button className="admin-btn small" type="button" onClick={() => setForm(u)}>
            Edit
          </button>
          <button className="admin-btn small danger" type="button" onClick={() => deleteUser(u)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="admin-toolbar">
        <SearchInput value={q} onChange={filter(setQ)} placeholder="Search by name or email…" />
        <select className="admin-select admin-input" value={tenantId} onChange={(e) => filter(setTenantId)(e.target.value)}>
          <option value="">All tenants</option>
          {(tenants.data?.items ?? []).map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 200 }} value={role} onChange={(e) => filter(setRole)(e.target.value)}>
          <option value="">Any role</option>
          <option value="owner">Owners</option>
          <option value="member">Sub-users (read-only)</option>
          <option value="admin">Admins</option>
        </select>
        <select className="admin-select admin-input" style={{ width: 150 }} value={active} onChange={(e) => filter(setActive)(e.target.value)}>
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <span className="spacer" />
        <button className="admin-btn primary" type="button" onClick={() => setForm('new')}>
          + New user
        </button>
      </div>
      <ErrorText>{error || remove.error}</ErrorText>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(u) => u.user_id}
        onRowClick={(u) => setDetailId(u.user_id)}
        empty="No users found"
      />
      <Pager total={data?.total} offset={offset} onChange={setOffset} />

      {form && (
        <UserForm
          user={form === 'new' ? null : form}
          tenants={tenants.data?.items ?? []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reload()
          }}
        />
      )}
      {detailId && (
        <UserDetail
          userId={detailId}
          tenants={tenants.data?.items ?? []}
          navigate={navigate}
          onClose={() => {
            setDetailId(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function UserForm({ user, tenants, onClose, onSaved }) {
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [tenantChoice, setTenantChoice] = useState(NEW_TENANT)
  const [tenantName, setTenantName] = useState('')
  const [role, setRole] = useState('member')
  const { error, busy, run } = useAction()

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const ok = await run(() =>
      user
        ? adminApi.updateUser(user.user_id, {
            full_name: fullName,
            email,
            is_active: isActive,
            password: password || null,
          })
        : adminApi.createUser({
            full_name: fullName,
            email,
            password,
            is_active: isActive,
            tenant_id: tenantChoice === NEW_TENANT ? null : tenantChoice,
            tenant_name: tenantChoice === NEW_TENANT ? tenantName || null : null,
            role_name: tenantChoice === NEW_TENANT ? null : role,
          }),
    )
    if (ok) onSaved()
  }

  return (
    <Modal title={user ? 'Edit user' : 'New user'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Full name
          <input required value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {user ? 'New password (leave empty to keep it)' : 'Password (min. 8 characters)'}
          <input
            required={!user}
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {!user && (
          <>
            <label>
              Tenant
              <select value={tenantChoice} onChange={(e) => setTenantChoice(e.target.value)}>
                <option value={NEW_TENANT}>Create a new tenant for this user</option>
                {tenants.map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    Existing: {t.name}
                  </option>
                ))}
              </select>
            </label>
            {tenantChoice === NEW_TENANT ? (
              <label>
                New tenant name (optional, defaults to the user's name)
                <input value={tenantName} maxLength={200} onChange={(e) => setTenantName(e.target.value)} />
              </label>
            ) : (
              <label>
                Role in the tenant
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <label className="admin-inline" style={{ display: 'flex' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (can sign in)
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="buttons">
          <button className="admin-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="admin-btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function UserDetail({ userId, tenants, navigate, onClose }) {
  const { data: user, error, reload } = useLoad(() => adminApi.user(userId), [userId])
  const [target, setTarget] = useState('')
  const [role, setRole] = useState('member')
  const action = useAction()

  if (!user) {
    return (
      <Modal title="User" onClose={onClose} wide>
        <ErrorText>{error}</ErrorText>
      </Modal>
    )
  }

  const assign = async () => {
    if (await action.run(() => adminApi.assignTenant(userId, { tenant_id: target, role_name: role }))) {
      setTarget('')
      reload()
    }
  }

  return (
    <Modal title={user.full_name} onClose={onClose} wide>
      <dl className="admin-kv">
        <dt>User ID</dt>
        <dd className="admin-mono">{user.user_id}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Status</dt>
        <dd>
          <Badge tone={user.is_active ? 'green' : 'red'}>{user.is_active ? 'active' : 'inactive'}</Badge>
        </dd>
        <dt>Created</dt>
        <dd>{formatDate(user.created_at)}</dd>
        <dt>Tenant</dt>
        <dd>
          {user.tenants.length === 0 && <Badge tone="red">none — this user cannot sign in</Badge>}
          {user.tenants.map((t) => (
            <div key={t.tenant_id}>
              {t.tenant_name} <Badge>{t.role_name}</Badge>
              <div className="admin-mono admin-muted">{t.tenant_id}</div>
            </div>
          ))}
        </dd>
      </dl>

      <h4 style={{ marginTop: 0 }}>Assign tenant</h4>
      <div className="admin-inline">
        <select className="admin-select admin-input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select a tenant…</option>
          {tenants.map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 120 }} value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button className="admin-btn primary" type="button" disabled={!target || action.busy} onClick={assign}>
          Assign
        </button>
      </div>
      <p className="admin-muted">Replaces the user's current tenant. Events already created stay in their original tenant.</p>
      <ErrorText>{action.error}</ErrorText>

      <h4>Events created by this user ({user.events.length})</h4>
      <DataTable
        columns={[
          { label: 'Event', render: (e) => <strong>{e.name}</strong> },
          { label: 'Category', render: (e) => e.event_type_display },
          { label: 'Date', render: (e) => formatDate(e.event_date) },
          { label: 'Tenant', render: (e) => e.tenant_name },
          { label: 'Status', render: (e) => <Badge tone={statusTone[e.status]}>{e.status}</Badge> },
        ]}
        rows={user.events}
        rowKey={(e) => e.event_id}
        empty="This user has not created any events"
      />
      <h4>Recent activity</h4>
      <ActivityTable items={user.activity} showUser={false} />
      <div className="admin-toolbar" style={{ marginTop: 16 }}>
        <button
          className="admin-btn"
          type="button"
          onClick={() => navigate('events', { created_by_user_id: user.user_id, creator: user.full_name })}
        >
          Open in Events →
        </button>
      </div>
    </Modal>
  )
}
