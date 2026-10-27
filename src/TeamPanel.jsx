import { useState } from 'react'
import './App.css'
import './admin/admin.css'
import { teamApi } from './api'
import {
  ACTION_OPTIONS,
  ActivityTable,
  Badge,
  DataTable,
  ErrorText,
  Modal,
  PAGE_SIZE,
  Pager,
  Stat,
  formatDate,
  useAction,
  useLoad,
} from './admin/ui'

const REFRESH_MS = 30000

// Panel del owner: crea perfiles de solo lectura para su gente y monitorea su actividad.
function TeamPanel({ organization, onBack }) {
  const [live, setLive] = useState(true)
  const [form, setForm] = useState(null) // 'new' | member
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [offset, setOffset] = useState(0)

  const members = useLoad(() => teamApi.members(), [], live ? REFRESH_MS : 0)
  const summary = useLoad(() => teamApi.summary(), [], live ? REFRESH_MS : 0)
  const feed = useLoad(
    () => teamApi.activity({ user_id: userFilter, action: actionFilter, limit: PAGE_SIZE, offset }),
    [userFilter, actionFilter, offset],
    live ? REFRESH_MS : 0,
  )
  const remove = useAction()

  const reloadAll = () => {
    members.reload()
    summary.reload()
    feed.reload()
  }

  const showActivityOf = (userId) => {
    setUserFilter(userId)
    setOffset(0)
    document.getElementById('team-activity')?.scrollIntoView({ behavior: 'smooth' })
  }

  const deleteMember = async (member) => {
    const ok = window.confirm(
      `Delete the profile of ${member.full_name}?\n\nTheir activity history is deleted too. To keep the history, deactivate the profile instead.`,
    )
    if (ok && (await remove.run(() => teamApi.remove(member.user_id)))) {
      if (userFilter === member.user_id) setUserFilter('')
      reloadAll()
    }
  }

  const stats = summary.data
  const peak = Math.max(1, ...(stats?.activity_by_day ?? []).map((d) => d.logins + d.views + d.denied))

  const columns = [
    {
      label: 'Profile',
      render: (m) => (
        <>
          <strong>{m.full_name}</strong>
          <div className="admin-muted">{m.email}</div>
        </>
      ),
    },
    {
      label: 'Status',
      render: (m) => <Badge tone={m.is_active ? 'green' : 'red'}>{m.is_active ? 'active' : 'inactive'}</Badge>,
    },
    { label: 'Last sign-in', render: (m) => (m.last_login ? formatDate(m.last_login) : <span className="admin-muted">Never</span>) },
    { label: 'Sign-ins (30 d)', render: (m) => m.logins_30d },
    { label: 'Views (30 d)', render: (m) => m.views_30d },
    {
      label: 'Blocked (30 d)',
      render: (m) => (m.denied_30d > 0 ? <Badge tone="red">{m.denied_30d}</Badge> : 0),
    },
    {
      label: '',
      render: (m) => (
        <div className="actions">
          <button className="admin-btn small" type="button" onClick={() => showActivityOf(m.user_id)}>
            Activity
          </button>
          <button className="admin-btn small" type="button" onClick={() => setForm(m)}>
            Edit
          </button>
          <button className="admin-btn small danger" type="button" onClick={() => deleteMember(m)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <main className="dashboard admin-dashboard">
      <header className="admin-header">
        <div>
          <button className="back-button" type="button" onClick={onBack}>
            ← Back to dashboard
          </button>
          <h1>Team</h1>
          <p>
            Read-only profiles for the people in {organization || 'your organization'}. They can view events but
            never change them.
          </p>
        </div>
        <div className="admin-session">
          <button className="create-event" type="button" onClick={() => setForm('new')}>
            <span className="plus-icon" aria-hidden="true">
              +
            </span>
            New sub-user
          </button>
        </div>
      </header>

      <div className="admin-toolbar" style={{ marginTop: 24 }}>
        <span className="spacer" />
        <label className="admin-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh (30 s)
        </label>
        <button className="admin-btn" type="button" onClick={reloadAll}>
          Refresh
        </button>
      </div>
      <ErrorText>{members.error || summary.error || feed.error || remove.error}</ErrorText>

      {stats && (
        <div className="admin-stats">
          <Stat label="Sub-users" value={stats.members} />
          <Stat label="Active" value={stats.active_members} tone="completed" />
          <Stat label="Online in 24 h" value={stats.online_last_24h} tone="upcoming" />
          <Stat label="Never signed in" value={stats.never_logged_in} />
          <Stat label="Blocked attempts (7 d)" value={stats.denied_last_7d} />
        </div>
      )}

      {stats && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3>
            Team activity, last 7 days <small>sign-ins, views and blocked attempts</small>
          </h3>
          <div className="admin-months">
            {stats.activity_by_day.map((day) => {
              const total = day.logins + day.views + day.denied
              const height = `${(total / peak) * 100}%`
              const share = (value) => ({ height: `${total ? (value / total) * 100 : 0}%` })
              return (
                <div className="col" key={day.day} title={`${day.logins} sign-ins, ${day.views} views, ${day.denied} blocked`}>
                  {total}
                  <span className="admin-stack" style={{ height }}>
                    <span className="views" style={share(day.views)} />
                    <span className="logins" style={share(day.logins)} />
                    <span className="denied" style={share(day.denied)} />
                  </span>
                  {day.day.slice(5)}
                </div>
              )
            })}
          </div>
          <div className="admin-legend">
            <span><i style={{ background: 'var(--blue)' }} />Views</span>
            <span><i style={{ background: 'var(--green)' }} />Sign-ins</span>
            <span><i style={{ background: '#d65f5f' }} />Blocked attempts</span>
          </div>
        </div>
      )}

      <h3 style={{ margin: '0 0 12px', fontWeight: 500 }}>Sub-user profiles</h3>
      <DataTable
        columns={columns}
        rows={members.data ?? []}
        rowKey={(m) => m.user_id}
        empty="You have not created any sub-user yet. Use “New sub-user” to give someone read-only access."
      />

      <h3 id="team-activity" style={{ margin: '32px 0 12px', fontWeight: 500 }}>
        Activity
      </h3>
      <div className="admin-toolbar">
        <select
          className="admin-select admin-input"
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value)
            setOffset(0)
          }}
        >
          <option value="">All sub-users</option>
          {(members.data ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <select
          className="admin-select admin-input"
          style={{ width: 260 }}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setOffset(0)
          }}
        >
          <option value="">All activity</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ActivityTable items={feed.data?.items ?? []} />
      <Pager total={feed.data?.total} offset={offset} onChange={setOffset} />

      {form && (
        <MemberForm
          member={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reloadAll()
          }}
        />
      )}
    </main>
  )
}

function MemberForm({ member, onClose, onSaved }) {
  const [fullName, setFullName] = useState(member?.full_name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(member?.is_active ?? true)
  const { error, busy, run } = useAction()

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const ok = await run(() =>
      member
        ? teamApi.update(member.user_id, { full_name: fullName, is_active: isActive, password: password || null })
        : teamApi.create({ full_name: fullName, email, password }),
    )
    if (ok) onSaved()
  }

  return (
    <Modal title={member ? 'Edit sub-user' : 'New sub-user'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Full name
          <input required value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Email (used to sign in)
          <input
            required
            type="email"
            disabled={Boolean(member)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {member ? 'New password (leave empty to keep it)' : 'Password (min. 8 characters)'}
          <input
            required={!member}
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {member && (
          <label className="admin-inline" style={{ display: 'flex' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (a deactivated profile loses access immediately)
          </label>
        )}
        <p className="admin-muted" style={{ margin: 0 }}>
          This profile can view your organization&apos;s events but cannot create, edit or delete them.
        </p>
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

export default TeamPanel
