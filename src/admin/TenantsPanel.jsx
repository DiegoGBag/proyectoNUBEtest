import { useState } from 'react'
import { adminApi } from '../adminApi'
import {
  Badge,
  DataTable,
  ErrorText,
  Modal,
  PAGE_SIZE,
  Pager,
  SearchInput,
  formatDate,
  shortId,
  useAction,
  useLoad,
} from './ui'

const ROLES = ['owner', 'admin', 'member']

export default function TenantsPanel({ initialFilters, navigate }) {
  const [q, setQ] = useState(initialFilters.q ?? '')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState(null) // 'new' | tenant
  const [detailId, setDetailId] = useState(null)
  const { data, error, reload } = useLoad(() => adminApi.tenants({ q, limit: PAGE_SIZE, offset }), [q, offset])
  const remove = useAction()

  const changeSearch = (value) => {
    setQ(value)
    setOffset(0)
  }

  const deleteTenant = async (tenant) => {
    const ok = window.confirm(
      `Delete "${tenant.name}"?\n\nThis also deletes its ${tenant.event_count} events and removes its ${tenant.user_count} memberships. Users are kept.`,
    )
    if (ok && (await remove.run(() => adminApi.deleteTenant(tenant.tenant_id)))) reload()
  }

  const columns = [
    { label: 'Tenant', render: (t) => <strong>{t.name}</strong> },
    { label: 'Tenant ID', render: (t) => <span className="admin-mono" title={t.tenant_id}>{t.tenant_id}</span> },
    { label: 'Slug', render: (t) => t.slug },
    { label: 'Users', render: (t) => t.user_count },
    { label: 'Events', render: (t) => t.event_count },
    { label: 'Created', render: (t) => formatDate(t.created_at, false) },
    {
      label: '',
      render: (t) => (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          <button className="admin-btn small" type="button" onClick={() => setForm(t)}>
            Edit
          </button>
          <button className="admin-btn small danger" type="button" onClick={() => deleteTenant(t)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="admin-toolbar">
        <SearchInput value={q} onChange={changeSearch} placeholder="Search by name or slug…" />
        <span className="spacer" />
        <button className="admin-btn primary" type="button" onClick={() => setForm('new')}>
          + New tenant
        </button>
      </div>
      <ErrorText>{error || remove.error}</ErrorText>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(t) => t.tenant_id}
        onRowClick={(t) => setDetailId(t.tenant_id)}
        empty="No tenants found"
      />
      <Pager total={data?.total} offset={offset} onChange={setOffset} />

      {form && (
        <TenantForm
          tenant={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reload()
          }}
        />
      )}
      {detailId && (
        <TenantDetail
          tenantId={detailId}
          onClose={() => {
            setDetailId(null)
            reload()
          }}
          navigate={navigate}
        />
      )}
    </>
  )
}

function TenantForm({ tenant, onClose, onSaved }) {
  const [name, setName] = useState(tenant?.name ?? '')
  const [slug, setSlug] = useState(tenant?.slug ?? '')
  const { error, busy, run } = useAction()

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const ok = await run(() =>
      tenant
        ? adminApi.updateTenant(tenant.tenant_id, { name, slug })
        : adminApi.createTenant({ name, slug: slug || null }),
    )
    if (ok) onSaved()
  }

  return (
    <Modal title={tenant ? 'Edit tenant' : 'New tenant'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Name
          <input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Slug {tenant ? '' : '(optional, generated from the name)'}
          <input required={Boolean(tenant)} value={slug} maxLength={100} onChange={(e) => setSlug(e.target.value)} />
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

function TenantDetail({ tenantId, onClose, navigate }) {
  const { data: tenant, error, reload } = useLoad(() => adminApi.tenant(tenantId), [tenantId])
  const users = useLoad(() => adminApi.users({ limit: 200 }), [])
  const [newUser, setNewUser] = useState('')
  const [newRole, setNewRole] = useState('member')
  const action = useAction()

  if (!tenant) {
    return (
      <Modal title="Tenant" onClose={onClose} wide>
        <ErrorText>{error}</ErrorText>
      </Modal>
    )
  }

  const memberIds = new Set(tenant.members.map((m) => m.user_id))
  const candidates = (users.data?.items ?? []).filter((u) => !memberIds.has(u.user_id))

  const mutate = async (fn) => {
    if (await action.run(fn)) reload()
  }

  return (
    <Modal title={tenant.name} onClose={onClose} wide>
      <dl className="admin-kv">
        <dt>Tenant ID</dt>
        <dd className="admin-mono">{tenant.tenant_id}</dd>
        <dt>Slug</dt>
        <dd>{tenant.slug}</dd>
        <dt>Created</dt>
        <dd>{formatDate(tenant.created_at)}</dd>
        <dt>Events</dt>
        <dd>
          {tenant.event_count}{' '}
          <button
            className="admin-link"
            type="button"
            onClick={() => navigate('events', { tenant_id: tenant.tenant_id })}
          >
            View events →
          </button>
        </dd>
      </dl>

      <ErrorText>{action.error}</ErrorText>
      <h4 style={{ marginTop: 0 }}>Members ({tenant.members.length})</h4>
      <DataTable
        columns={[
          { label: 'User', render: (m) => <strong>{m.full_name}</strong> },
          { label: 'Email', render: (m) => m.email },
          { label: 'Active', render: (m) => <Badge tone={m.is_active ? 'green' : 'red'}>{m.is_active ? 'active' : 'inactive'}</Badge> },
          {
            label: 'Role',
            render: (m) => (
              <select
                className="admin-select admin-input"
                style={{ width: 120 }}
                value={m.role_name}
                onChange={(e) => mutate(() => adminApi.setMemberRole(tenantId, m.user_id, e.target.value))}
              >
                {ROLES.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            ),
          },
          {
            label: '',
            render: (m) => (
              <div className="actions">
                <button
                  className="admin-btn small danger"
                  type="button"
                  onClick={() =>
                    window.confirm(`Remove ${m.full_name} from this tenant?`) &&
                    mutate(() => adminApi.removeMember(tenantId, m.user_id))
                  }
                >
                  Remove
                </button>
              </div>
            ),
          },
        ]}
        rows={tenant.members}
        rowKey={(m) => m.user_id}
        empty="This tenant has no members"
      />

      <h4>Assign a user to this tenant</h4>
      <div className="admin-inline">
        <select
          className="admin-select admin-input"
          value={newUser}
          onChange={(e) => setNewUser(e.target.value)}
        >
          <option value="">Select a user…</option>
          {candidates.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.full_name} — {u.email} ({shortId(u.tenants[0]?.tenant_id)})
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 120 }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
          {ROLES.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
        <button
          className="admin-btn primary"
          type="button"
          disabled={!newUser || action.busy}
          onClick={() =>
            mutate(async () => {
              await adminApi.addMember(tenantId, { user_id: newUser, role_name: newRole })
              setNewUser('')
            })
          }
        >
          Assign
        </button>
      </div>
      <p className="admin-muted">
        A user who belongs to several tenants signs in to the one they joined first.
      </p>
    </Modal>
  )
}
