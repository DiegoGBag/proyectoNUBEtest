import { useState } from 'react'
import { adminApi } from '../adminApi'
import { Badge, DataTable, ErrorText, Modal, useAction, useLoad } from './ui'

export default function CategoriesPanel({ navigate }) {
  const { data, error, reload } = useLoad(() => adminApi.categories(), [])
  const [form, setForm] = useState(null) // 'new' | category
  const remove = useAction()

  const deleteCategory = async (category) => {
    if (
      window.confirm(`Delete the category "${category.display_name}"?`) &&
      (await remove.run(() => adminApi.deleteCategory(category.event_type_id)))
    ) {
      reload()
    }
  }

  const columns = [
    { label: 'Category', render: (c) => <strong>{c.display_name}</strong> },
    { label: 'Key', render: (c) => <span className="admin-mono">{c.name}</span> },
    {
      label: 'Events',
      render: (c) => (
        <button className="admin-link" type="button" onClick={() => navigate('events', { category: c.name })}>
          {c.event_count}
        </button>
      ),
    },
    {
      label: 'Status',
      render: (c) => <Badge tone={c.is_active ? 'green' : 'neutral'}>{c.is_active ? 'active' : 'disabled'}</Badge>,
    },
    {
      label: '',
      render: (c) => (
        <div className="actions">
          <button className="admin-btn small" type="button" onClick={() => setForm(c)}>
            Edit
          </button>
          <button
            className="admin-btn small danger"
            type="button"
            disabled={c.event_count > 0}
            title={c.event_count > 0 ? 'In use by events' : undefined}
            onClick={() => deleteCategory(c)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="admin-toolbar">
        <span className="spacer" />
        <button className="admin-btn primary" type="button" onClick={() => setForm('new')}>
          + New category
        </button>
      </div>
      <ErrorText>{error || remove.error}</ErrorText>
      <DataTable columns={columns} rows={data ?? []} rowKey={(c) => c.event_type_id} empty="No categories" />
      <p className="admin-muted">
        The event form for regular users offers conference, business, social and workshop; other categories
        can be assigned to events from this panel.
      </p>
      {form && (
        <CategoryForm
          category={form === 'new' ? null : form}
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

function CategoryForm({ category, onClose, onSaved }) {
  const [name, setName] = useState(category?.name ?? '')
  const [displayName, setDisplayName] = useState(category?.display_name ?? '')
  const [isActive, setIsActive] = useState(category?.is_active ?? true)
  const { error, busy, run } = useAction()

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const ok = await run(() =>
      category
        ? adminApi.updateCategory(category.event_type_id, { display_name: displayName, is_active: isActive })
        : adminApi.createCategory({ name, display_name: displayName, is_active: isActive }),
    )
    if (ok) onSaved()
  }

  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Key (lowercase letters, numbers, - and _)
          <input
            required
            disabled={Boolean(category)}
            pattern="[a-z0-9_\-]+"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Display name
          <input required maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="admin-inline" style={{ display: 'flex' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
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
