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
  statusTone,
  toLocalInput,
  useAction,
  useLoad,
} from './ui'

const STATUSES = ['planned', 'active', 'completed']

export default function EventsPanel({ initialFilters }) {
  const [q, setQ] = useState(initialFilters.q ?? '')
  const [tenantId, setTenantId] = useState(initialFilters.tenant_id ?? '')
  const [userId, setUserId] = useState(initialFilters.created_by_user_id ?? '')
  const [category, setCategory] = useState(initialFilters.category ?? '')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState(null) // 'new' | event
  const { data, error, reload } = useLoad(
    () =>
      adminApi.events({
        q,
        tenant_id: tenantId,
        created_by_user_id: userId,
        event_type: category,
        status,
        limit: PAGE_SIZE,
        offset,
      }),
    [q, tenantId, userId, category, status, offset],
  )
  const tenants = useLoad(() => adminApi.tenants({ limit: 200 }), [])
  const categories = useLoad(() => adminApi.categories(), [])
  const remove = useAction()

  const filter = (setter) => (value) => {
    setter(value)
    setOffset(0)
  }

  const deleteEvent = async (event) => {
    if (window.confirm(`Delete "${event.name}"?`) && (await remove.run(() => adminApi.deleteEvent(event.event_id)))) {
      reload()
    }
  }

  const columns = [
    { label: 'Event', render: (e) => <strong>{e.name}</strong> },
    { label: 'Category', render: (e) => e.event_type_display },
    { label: 'Date', render: (e) => formatDate(e.event_date) },
    { label: 'Location', render: (e) => e.location },
    { label: 'Attendees', render: (e) => e.expected_attendees },
    {
      label: 'Tenant',
      render: (e) => (
        <>
          {e.tenant_name}
          <div className="admin-mono admin-muted">{e.tenant_id}</div>
        </>
      ),
    },
    {
      label: 'Created by',
      render: (e) => (
        <>
          {e.created_by_name}
          <div className="admin-muted">{e.created_by_email}</div>
        </>
      ),
    },
    { label: 'Status', render: (e) => <Badge tone={statusTone[e.status]}>{e.status}</Badge> },
    {
      label: '',
      render: (e) => (
        <div className="actions">
          <button className="admin-btn small" type="button" onClick={() => setForm(e)}>
            Edit
          </button>
          <button className="admin-btn small danger" type="button" onClick={() => deleteEvent(e)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="admin-toolbar">
        <SearchInput value={q} onChange={filter(setQ)} placeholder="Search name, location, description…" />
        <select className="admin-select admin-input" style={{ width: 190 }} value={tenantId} onChange={(e) => filter(setTenantId)(e.target.value)}>
          <option value="">All tenants</option>
          {(tenants.data?.items ?? []).map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 160 }} value={category} onChange={(e) => filter(setCategory)(e.target.value)}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.name} value={c.name}>
              {c.display_name}
            </option>
          ))}
        </select>
        <select className="admin-select admin-input" style={{ width: 150 }} value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {userId && (
          <button className="admin-btn small" type="button" onClick={() => filter(setUserId)('')}>
            Creator: {initialFilters.creator ?? 'selected user'} ×
          </button>
        )}
        <span className="spacer" />
        <button className="admin-btn primary" type="button" onClick={() => setForm('new')}>
          + New event
        </button>
      </div>
      <ErrorText>{error || remove.error}</ErrorText>

      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(e) => e.event_id} empty="No events found" />
      <Pager total={data?.total} offset={offset} onChange={setOffset} />

      {form && (
        <EventForm
          event={form === 'new' ? null : form}
          tenants={tenants.data?.items ?? []}
          categories={categories.data ?? []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function EventForm({ event, tenants, categories, onClose, onSaved }) {
  const [tenantId, setTenantId] = useState(event?.tenant_id ?? '')
  const [creatorId, setCreatorId] = useState(event?.created_by_user_id ?? '')
  const [name, setName] = useState(event?.name ?? '')
  const [category, setCategory] = useState(event?.event_type ?? '')
  const [date, setDate] = useState(event ? toLocalInput(event.event_date) : '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [attendees, setAttendees] = useState(String(event?.expected_attendees ?? 0))
  const [status, setStatus] = useState(event?.status ?? 'planned')
  const { error, busy, run } = useAction()

  // Los candidatos a "creador" son los miembros del tenant elegido.
  const members = useLoad(() => (tenantId && !event ? adminApi.tenant(tenantId) : Promise.resolve(null)), [tenantId])

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const body = {
      name,
      event_type: category,
      event_date: new Date(date).toISOString(),
      location,
      description: description || null,
      expected_attendees: Number(attendees) || 0,
      status,
    }
    const ok = await run(() =>
      event
        ? adminApi.updateEvent(event.event_id, body)
        : adminApi.createEvent({ ...body, tenant_id: tenantId, created_by_user_id: creatorId }),
    )
    if (ok) onSaved()
  }

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        {event ? (
          <p className="admin-muted" style={{ margin: 0 }}>
            {event.tenant_name} · created by {event.created_by_name}
          </p>
        ) : (
          <div className="row">
            <label>
              Tenant
              <select
                required
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value)
                  setCreatorId('')
                }}
              >
                <option value="">Select…</option>
                {tenants.map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Created by
              <select required value={creatorId} onChange={(e) => setCreatorId(e.target.value)}>
                <option value="">Select…</option>
                {(members.data?.members ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label>
          Name
          <input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row">
          <label>
            Category
            <select required value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Date and time
            <input required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Expected attendees
            <input type="number" min="0" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          </label>
        </div>
        <label>
          Location
          <input required value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
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
