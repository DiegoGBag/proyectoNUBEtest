import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import './App.css'
import AuthScreen from './AuthScreen'
import Shell, { Icon } from './Shell'
import {
  clearToken,
  createEvent as createEventRequest,
  getCompletedEvents,
  getCurrentUser,
  getOverview,
  getStats,
  getToken,
  getUpcomingEvents,
  isMasterAdmin,
} from './api'

// El panel del administrador maestro se descarga solo cuando ese usuario entra.
const AdminApp = lazy(() => import('./admin/AdminApp'))
// Igual con el panel de sub-usuarios del owner.
const TeamPanel = lazy(() => import('./TeamPanel'))

const initialStatistics = {
  total: 0,
  upcoming: 0,
  completed: 0,
}

const emptyEvent = {
  name: '',
  type: '',
  date: '',
  time: '',
  location: '',
  description: '',
  attendees: '0',
  status: 'planned',
}

const eventTypes = [
  ['conference', 'Conference'],
  ['business', 'Business'],
  ['social', 'Social'],
  ['workshop', 'Workshop'],
]

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getToken()))

  useEffect(() => {
    const handleLogout = () => setIsAuthenticated(false)
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />
  }

  const logout = () => {
    clearToken()
    setIsAuthenticated(false)
  }

  if (isMasterAdmin()) {
    return (
      <Suspense fallback={<main className="dashboard">Loading…</main>}>
        <AdminApp onLogout={logout} />
      </Suspense>
    )
  }

  return <EventsApp onLogout={logout} />
}

function EventsApp({ onLogout }) {
  // Una sola pagina activa: 'home' | 'upcoming' | 'completed' | 'create' | 'team'
  const [page, setPage] = useState('home')
  const [statistics, setStatistics] = useState(initialStatistics)
  const [overview, setOverview] = useState([])
  const [event, setEvent] = useState(emptyEvent)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [completedEvents, setCompletedEvents] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)

  // Los perfiles `member` (sub-usuarios) son de solo lectura; la API lo exige igualmente.
  const canWrite = Boolean(currentUser) && currentUser.role !== 'member'
  const isOwner = currentUser?.role === 'owner'

  useEffect(() => {
    getCurrentUser()
      .then(setCurrentUser)
      .catch(() => {})
  }, [])

  const loadDashboard = useCallback(async () => {
    try {
      const [stats, monthly, upcoming, completed] = await Promise.all([
        getStats(),
        getOverview(),
        getUpcomingEvents(),
        getCompletedEvents(),
      ])
      setStatistics(stats)
      setOverview(monthly)
      // Solo eventos de hoy en adelante (dia local); los de dias anteriores ya no son "upcoming"
      setUpcomingEvents(upcoming.filter((savedEvent) => !isPastDate(savedEvent.date)))
      setCompletedEvents(completed)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  const loadUpcoming = useCallback(async () => {
    try {
      const events = await getUpcomingEvents()
      setUpcomingEvents(events.filter((savedEvent) => !isPastDate(savedEvent.date)))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  const loadCompleted = useCallback(async () => {
    try {
      setCompletedEvents(await getCompletedEvents())
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (page === 'upcoming') loadUpcoming()
    if (page === 'completed') loadCompleted()
  }, [page, loadUpcoming, loadCompleted])

  const updateEvent = (field, value) => {
    setEvent((currentEvent) => {
      const nextEvent = { ...currentEvent, [field]: value }
      // Un evento con fecha anterior a hoy solo puede registrarse como completado
      if (isPastDate(nextEvent.date)) nextEvent.status = 'completed'
      return nextEvent
    })
  }

  const isEventInPast = isPastDate(event.date)

  const goTo = (nextPage) => {
    setError('')
    if (nextPage === 'create') setEvent(emptyEvent)
    setPage(nextPage)
  }

  const createEvent = async (formEvent) => {
    formEvent.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      // Nota: la foto todavia no se envia; la subida a S3 es un paso posterior.
      await createEventRequest(event)
      setEvent(emptyEvent)
      await loadDashboard()
      setPage('home')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const formatEventDate = (date) => {
    if (!date) return 'Date to be confirmed'

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
    }).format(new Date(`${date}T00:00:00`))
  }

  const nav = [
    { id: 'home', label: 'Dashboard', icon: 'overview' },
    { id: 'upcoming', label: 'Upcoming', icon: 'upcoming' },
    { id: 'completed', label: 'Completed', icon: 'completed' },
    ...(canWrite ? [{ id: 'create', label: 'Create event', icon: 'create' }] : []),
    ...(isOwner ? [{ id: 'team', label: 'Team', icon: 'users' }] : []),
  ]

  const titles = {
    home: ['Events', 'Create and manage your events in one place'],
    upcoming: ['Upcoming events', 'All your planned and active events, organized by type'],
    completed: ['Completed events', 'Review the details and results of your past events'],
    create: ['Create event', 'Fill in the details to get started'],
    team: [
      'Team',
      `Read-only profiles for the people in ${currentUser?.tenant_name || 'your organization'}. They can view events but never change them.`,
    ],
  }
  const [title, subtitle] = titles[page]

  const recentCompleted = [...completedEvents]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 4)
  const nextUpcoming = [...upcomingEvents]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 4)

  const errorMessage = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  )

  let content = null

  if (page === 'team' && isOwner) {
    content = (
      <Suspense fallback={<p className="admin-muted">Loading…</p>}>
        <TeamPanel />
      </Suspense>
    )
  } else if (page === 'upcoming') {
    content = (
      <>
        {errorMessage}
        <section className="event-columns" aria-label="Upcoming events by type">
          {eventTypes.map(([type, label]) => {
            const typeEvents = upcomingEvents.filter((savedEvent) => savedEvent.type === type)

            return (
              <article className="event-column" key={type}>
                <header>
                  <h2>{label}</h2>
                  <span>{typeEvents.length}</span>
                </header>
                <div className="event-column-content">
                  {typeEvents.length === 0 ? (
                    <p className="empty-column">No upcoming events</p>
                  ) : (
                    typeEvents.map((savedEvent) => (
                      <article className="saved-event" key={savedEvent.id}>
                        <h3>{savedEvent.name}</h3>
                        <p>
                          {formatEventDate(savedEvent.date)} · {savedEvent.time}
                        </p>
                        <p>{savedEvent.location}</p>
                        <span className={`event-status ${savedEvent.status}`}>
                          {savedEvent.status}
                        </span>
                      </article>
                    ))
                  )}
                </div>
              </article>
            )
          })}
        </section>
      </>
    )
  } else if (page === 'completed') {
    content = (
      <>
        {errorMessage}
        <section className="completed-events" aria-label="Completed event details">
          <div className="completed-table" role="table">
            <div className="completed-table-row table-header" role="row">
              <span role="columnheader">Event</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Date</span>
              <span role="columnheader">Location</span>
              <span role="columnheader">Attendees</span>
              <span role="columnheader">Status</span>
            </div>
            {completedEvents.length === 0 ? (
              <p className="empty-completed">No completed events yet.</p>
            ) : (
              completedEvents.map((savedEvent) => (
                <div className="completed-table-row" key={savedEvent.id} role="row">
                  <strong role="cell">{savedEvent.name}</strong>
                  <span role="cell">
                    {eventTypes.find(([type]) => type === savedEvent.type)?.[1] ||
                      savedEvent.type}
                  </span>
                  <span role="cell">{formatEventDate(savedEvent.date)}</span>
                  <span role="cell">{savedEvent.location}</span>
                  <span role="cell">{savedEvent.attendees}</span>
                  <span className="completed-label" role="cell">
                    {savedEvent.displayStatus}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </>
    )
  } else if (page === 'create' && canWrite) {
    content = (
      <form className="event-form" onSubmit={createEvent}>
        <label>
          Event name
          <input
            required
            type="text"
            placeholder="My awesome event"
            value={event.name}
            onChange={(formEvent) => updateEvent('name', formEvent.target.value)}
          />
        </label>

        <div className="form-row">
          <label>
            Event type
            <select
              required
              value={event.type}
              onChange={(formEvent) => updateEvent('type', formEvent.target.value)}
            >
              <option value="">Select an event type</option>
              {eventTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expected attendees
            <input
              min="0"
              type="number"
              value={event.attendees}
              onChange={(formEvent) => updateEvent('attendees', formEvent.target.value)}
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Date
            <input
              required
              type="date"
              value={event.date}
              onChange={(formEvent) => updateEvent('date', formEvent.target.value)}
            />
          </label>
          <label>
            Time
            <input
              required
              type="time"
              value={event.time}
              onChange={(formEvent) => updateEvent('time', formEvent.target.value)}
            />
          </label>
        </div>

        <label>
          Location
          <input
            required
            type="text"
            placeholder="Event venue or address"
            value={event.location}
            onChange={(formEvent) => updateEvent('location', formEvent.target.value)}
          />
        </label>

        <label>
          Description
          <textarea
            rows="4"
            placeholder="Tell people about your event..."
            value={event.description}
            onChange={(formEvent) => updateEvent('description', formEvent.target.value)}
          />
        </label>

        <fieldset>
          <legend>Status</legend>
          <div className="status-options">
            {[
              ['planned', 'Planned'],
              ['active', 'Active'],
              ['completed', 'Completed'],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="status"
                  value={value}
                  checked={event.status === value}
                  disabled={isEventInPast && value !== 'completed'}
                  onChange={(formEvent) => updateEvent('status', formEvent.target.value)}
                />
                {label}
              </label>
            ))}
          </div>
          {isEventInPast && (
            <p className="form-hint">Events with a past date can only be marked as completed.</p>
          )}
        </fieldset>

        {errorMessage}

        <div className="form-actions">
          <button className="cancel-button" type="button" onClick={() => goTo('home')}>
            Cancel
          </button>
          <button className="create-event" type="submit" disabled={isSaving}>
            <Icon name="create" />
            {isSaving ? 'Saving…' : 'Create event'}
          </button>
        </div>
      </form>
    )
  } else {
    content = (
      <>
        <div className="header-actions">
          {canWrite && (
            <button className="create-event" type="button" onClick={() => goTo('create')}>
              <Icon name="create" />
              Create event
            </button>
          )}
          {currentUser?.role === 'member' && (
            <span className="read-only-badge" title="Your profile can view events but not change them">
              View only
            </span>
          )}
          {isOwner && (
            <button className="cancel-button" type="button" onClick={() => goTo('team')}>
              Team
            </button>
          )}
        </div>

        {errorMessage}

        <section className="statistics" aria-label="Event statistics">
          {[
            ['Total events', statistics.total, 'total', false, 'users'],
            ['Upcoming', statistics.upcoming, 'upcoming', true, 'events'],
            ['Completed', statistics.completed, 'completed', true, 'events'],
          ].map(([label, value, tone, isInteractive, icon]) => (
            <button
              className={`${isInteractive ? 'stat-card interactive' : 'stat-card'} ${tone}`}
              key={label}
              type="button"
              onClick={() => goTo(label === 'Upcoming' ? 'upcoming' : 'completed')}
            >
              <h2>{label}</h2>
              <Icon name={icon} className="stat-icon" />
              <p className={`stat-value ${tone}`}>{value}</p>
            </button>
          ))}
        </section>

        <div className="home-grid">
          <StatisticsChart overview={overview} />

          <div className="home-side">
            <section className="home-card">
              <h2>Recent Event Activity</h2>
              <ul className="timeline">
                {recentCompleted.length === 0 && <li className="timeline-empty">No activity yet</li>}
                {recentCompleted.map((savedEvent) => (
                  <li key={savedEvent.id}>
                    <span className="timeline-dot done" aria-hidden="true" />
                    <div>
                      <strong>{savedEvent.name}</strong>
                      <small>Completed · {savedEvent.location}</small>
                    </div>
                    <time>{formatEventDate(savedEvent.date)}</time>
                  </li>
                ))}
              </ul>
            </section>

            <section className="home-card">
              <h2>Upcoming Schedules / Milestones</h2>
              <ul className="timeline">
                {nextUpcoming.length === 0 && <li className="timeline-empty">Nothing scheduled</li>}
                {nextUpcoming.map((savedEvent) => (
                  <li key={savedEvent.id}>
                    <span className="timeline-dot upcoming" aria-hidden="true" />
                    <div>
                      <strong>{savedEvent.name}</strong>
                      <small>{savedEvent.location}</small>
                    </div>
                    <time>
                      {formatEventDate(savedEvent.date)}
                      {savedEvent.time ? ` · ${savedEvent.time}` : ''}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </>
    )
  }

  return (
    <Shell
      brand="Events Manager"
      nav={nav}
      active={page}
      onNavigate={goTo}
      title={title}
      subtitle={subtitle}
      user={
        currentUser && {
          name: currentUser.full_name,
          lines: [currentUser.tenant_name, currentUser.tenant_id],
          title: currentUser.email,
        }
      }
      onLogout={onLogout}
    >
      {content}
    </Shell>
  )
}

// `date` es 'YYYY-MM-DD' (input type="date"); se compara con el dia local de hoy.
function isPastDate(date) {
  if (!date) return false
  const today = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return date < todayKey
}

function getChartTicks(maxValue) {
  const rawStep = Math.max(maxValue, 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step =
    [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rawStep)

  return Array.from({ length: 5 }, (_, index) => index * step)
}

// `overview` viene de GET /api/events/overview: un elemento por mes con los
// conteos de ESE mes ({ month: 'YYYY-MM', total, upcoming, completed }).
// La grafica es acumulada, asi que se suman mes a mes.
function buildChartPoints(overview) {
  let total = 0
  let upcoming = 0
  let completed = 0

  return overview.map((item) => {
    total += item.total
    upcoming += item.upcoming
    completed += item.completed
    const [year, month] = item.month.split('-').map(Number)
    const date = new Date(year, month - 1, 1)

    return {
      key: item.month,
      label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
      fullLabel: new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(date),
      completed,
      upcoming,
      total,
    }
  })
}

function StatisticsChart({ overview }) {
  const points = buildChartPoints(overview)

  if (points.length < 2) return null

  const ticks = getChartTicks(Math.max(...points.map((point) => point.total)))
  const chartMax = ticks[ticks.length - 1]
  const xFor = (index) => (index / (points.length - 1)) * 100
  const yFor = (value) => 100 - (value / chartMax) * 100

  const linePath = (getValue) =>
    points
      .map((point, index) => `${index ? 'L' : 'M'}${xFor(index)},${yFor(getValue(point))}`)
      .join(' ')
  const areaPath = (getTop, getBottom) => {
    const top = points.map(
      (point, index) => `${xFor(index)},${yFor(getTop(point))}`,
    )
    const bottom = points
      .map((point, index) => `${xFor(index)},${yFor(getBottom(point))}`)
      .reverse()
    return `M${top.join(' L')} L${bottom.join(' L')} Z`
  }

  return (
    <section className="statistics-chart" aria-labelledby="statistics-chart-title">
      <header>
        <div>
          <h2 id="statistics-chart-title">Events overview</h2>
          <p>Cumulative events by month</p>
        </div>
        <ul className="chart-legend">
          <li className="total">Total events</li>
          <li className="upcoming">Upcoming</li>
          <li className="completed">Completed</li>
        </ul>
      </header>

      <div className="chart-area">
        <div className="chart-axis" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
        </div>

        <div className="chart-plot">
          {ticks.map((tick) => (
            <span
              className={tick === 0 ? 'chart-gridline baseline' : 'chart-gridline'}
              key={tick}
              style={{ bottom: `${(tick / chartMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <svg
            className="chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="chart-area-fill completed"
              d={areaPath((point) => point.completed, () => 0)}
            />
            <path
              className="chart-area-fill upcoming"
              d={areaPath(
                (point) => point.total,
                (point) => point.completed,
              )}
            />
            <path
              className="chart-line completed"
              d={linePath((point) => point.completed)}
            />
            <path className="chart-line total" d={linePath((point) => point.total)} />
          </svg>

          <ul className="chart-points" aria-label="Cumulative events by month">
            {points.map((point, index) => (
              <li
                className={index > points.length / 2 ? 'chart-point flip' : 'chart-point'}
                key={point.key}
                style={{
                  left: `${xFor(index)}%`,
                  width: `${100 / (points.length - 1)}%`,
                }}
                tabIndex={0}
                aria-label={`${point.fullLabel}: ${point.total} total, ${point.upcoming} upcoming, ${point.completed} completed`}
              >
                <span className="chart-crosshair" aria-hidden="true" />
                <span
                  className="chart-marker total"
                  style={{ bottom: `${100 - yFor(point.total)}%` }}
                  aria-hidden="true"
                />
                <span
                  className="chart-marker completed"
                  style={{ bottom: `${100 - yFor(point.completed)}%` }}
                  aria-hidden="true"
                />
                <span className="chart-tooltip" role="tooltip">
                  <strong className="chart-tooltip-title">{point.fullLabel}</strong>
                  <span className="total">
                    Total events <strong>{point.total}</strong>
                  </span>
                  <span className="upcoming">
                    Upcoming <strong>{point.upcoming}</strong>
                  </span>
                  <span className="completed">
                    Completed <strong>{point.completed}</strong>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="chart-labels" aria-hidden="true">
          {points.map((point, index) => (
            <span key={point.key} style={{ left: `${xFor(index)}%` }}>
              {point.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default App
