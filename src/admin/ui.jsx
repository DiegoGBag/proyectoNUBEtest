import { useEffect, useRef, useState } from 'react'

export const PAGE_SIZE = 20

// La API devuelve fechas UTC sin zona ("2026-10-06T01:00:00"); se leen como UTC.
export const parseUtc = (value) =>
  new Date(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`)

export const formatDate = (value, withTime = true) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        ...(withTime ? { timeStyle: 'short' } : {}),
      }).format(parseUtc(value))
    : '—'

const pad = (n) => String(n).padStart(2, '0')

// UTC de la API -> valor de <input type="datetime-local"> en hora local.
export const toLocalInput = (value) => {
  const d = parseUtc(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '—')

// Carga datos al montar y cuando cambian `deps`; `refreshMs` los refresca en segundo plano.
export function useLoad(fetcher, deps = [], refreshMs = 0) {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async (silent) => {
      if (!silent) setState((current) => ({ ...current, loading: true }))
      try {
        const data = await fetcher()
        if (!cancelled) setState({ data, error: '', loading: false })
      } catch (requestError) {
        if (!cancelled) {
          setState((current) => ({ ...current, error: requestError.message, loading: false }))
        }
      }
    }
    run(false)
    const timer = refreshMs ? setInterval(() => run(true), refreshMs) : null
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, refreshMs])

  return { ...state, reload: () => setTick((current) => current + 1) }
}

export function Modal({ title, onClose, wide = false, children }) {
  useEffect(() => {
    const onKey = (keyEvent) => keyEvent.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="admin-backdrop"
      onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}
    >
      <div className={`admin-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="admin-icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function ErrorText({ children }) {
  return children ? (
    <p className="form-error" role="alert">
      {children}
    </p>
  ) : null
}

export function Pager({ total, limit = PAGE_SIZE, offset, onChange }) {
  if (!total) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="admin-pager">
      <span>
        {from}–{to} of {total}
      </span>
      <button type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        ← Prev
      </button>
      <button type="button" disabled={to >= total} onClick={() => onChange(offset + limit)}>
        Next →
      </button>
    </div>
  )
}

// Caja de busqueda con retraso para no llamar a la API en cada tecla.
export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  const [text, setText] = useState(value)
  const latestOnChange = useRef(onChange)

  useEffect(() => {
    latestOnChange.current = onChange
  })

  useEffect(() => {
    const timer = setTimeout(() => text !== value && latestOnChange.current(text), 300)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <input
      className="admin-input"
      type="search"
      value={text}
      placeholder={placeholder}
      onChange={(inputEvent) => setText(inputEvent.target.value)}
    />
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>
}

export const statusTone = { planned: 'blue', active: 'green', completed: 'neutral' }

export function DataTable({ columns, rows, rowKey, onRowClick, empty = 'Nothing to show' }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="admin-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.label}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Ejecuta una accion de la API mostrando el error en pantalla; devuelve true si salio bien.
export function useAction() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action) => {
    setError('')
    setBusy(true)
    try {
      await action()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { error, busy, run, setError }
}

export function Stat({ label, value, tone }) {
  return (
    <div className="stat-card admin-stat">
      <h2>{label}</h2>
      <span className={`stat-value ${tone ?? ''}`}>{value ?? '—'}</span>
    </div>
  )
}

// Lista de barras horizontales, sin librerias de graficas.
export function BarList({ items, labelKey, valueKey, tone = 'blue' }) {
  const max = Math.max(1, ...items.map((item) => item[valueKey]))
  if (items.length === 0) return <p className="admin-muted">No data yet</p>
  return (
    <ul className="admin-bars">
      {items.map((item) => (
        <li key={item[labelKey]}>
          <span className="label">{item[labelKey]}</span>
          <span className="track">
            <span className={`fill ${tone}`} style={{ width: `${(item[valueKey] / max) * 100}%` }} />
          </span>
          <span className="value">{item[valueKey]}</span>
        </li>
      ))}
    </ul>
  )
}

const ACTIONS = {
  login: ['Signed in', 'green'],
  view_dashboard: ['Opened the dashboard', 'neutral'],
  view_upcoming: ['Viewed upcoming events', 'blue'],
  view_completed: ['Viewed completed events', 'blue'],
  view_event: ['Viewed an event', 'blue'],
  denied_write: ['Tried to change data (blocked)', 'red'],
}

export const ACTION_OPTIONS = Object.entries(ACTIONS).map(([value, [label]]) => ({ value, label }))

export function ActionBadge({ action }) {
  const [label, tone] = ACTIONS[action] ?? [action, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}

// Tabla de actividad compartida por el panel del owner y el del administrador maestro.
export function ActivityTable({ items, showTenant = false, showUser = true }) {
  const columns = [
    { label: 'When', render: (a) => formatDate(a.created_at) },
    ...(showUser ? [{ label: 'User', render: (a) => (
      <>
        {a.full_name}
        <div className="admin-muted">{a.email}</div>
      </>
    ) }] : []),
    ...(showTenant ? [{ label: 'Tenant', render: (a) => a.tenant_name }] : []),
    { label: 'Activity', render: (a) => <ActionBadge action={a.action} /> },
    { label: 'Detail', render: (a) => a.detail ?? '—' },
    { label: 'IP', render: (a) => <span className="admin-mono">{a.ip_address ?? '—'}</span> },
  ]
  return (
    <DataTable columns={columns} rows={items} rowKey={(a) => a.activity_id} empty="No activity recorded yet" />
  )
}
