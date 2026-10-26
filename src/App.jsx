import { useCallback, useEffect, useState } from 'react'
import './App.css'
import AuthScreen from './AuthScreen'
import {
  clearToken,
  createEvent as createEventRequest,
  getCompletedEvents,
  getCurrentUser,
  getOverview,
  getStats,
  getToken,
  getUpcomingEvents,
} from './api'

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
  photo: null,
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

  return (
    <EventsApp
      onLogout={() => {
        clearToken()
        setIsAuthenticated(false)
      }}
    />
  )
}

function EventsApp({ onLogout }) {
  const [isCreating, setIsCreating] = useState(false)
  const [isViewingUpcoming, setIsViewingUpcoming] = useState(false)
  const [isViewingCompleted, setIsViewingCompleted] = useState(false)
  const [statistics, setStatistics] = useState(initialStatistics)
  const [overview, setOverview] = useState([])
  const [event, setEvent] = useState(emptyEvent)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [completedEvents, setCompletedEvents] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    getCurrentUser()
      .then(setCurrentUser)
      .catch(() => {})
  }, [])

  const loadDashboard = useCallback(async () => {
    try {
      const [stats, monthly] = await Promise.all([getStats(), getOverview()])
      setStatistics(stats)
      setOverview(monthly)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  const loadUpcoming = useCallback(async () => {
    try {
      // Solo eventos de hoy en adelante (dia local); los de dias anteriores ya no son "upcoming"
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
    if (isViewingUpcoming) loadUpcoming()
  }, [isViewingUpcoming, loadUpcoming])

  useEffect(() => {
    if (isViewingCompleted) loadCompleted()
  }, [isViewingCompleted, loadCompleted])

  const updateEvent = (field, value) => {
    setEvent((currentEvent) => {
      const nextEvent = { ...currentEvent, [field]: value }
      // Un evento con fecha anterior a hoy solo puede registrarse como completado
      if (isPastDate(nextEvent.date)) nextEvent.status = 'completed'
      return nextEvent
    })
  }

  const isEventInPast = isPastDate(event.date)

  const openCreateForm = () => {
    setEvent(emptyEvent)
    setError('')
    setIsViewingUpcoming(false)
    setIsViewingCompleted(false)
    setIsCreating(true)
  }

  const cancelCreate = () => {
    setIsCreating(false)
    setError('')
    setEvent(emptyEvent)
  }

  const createEvent = async (formEvent) => {
    formEvent.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      // Nota: la foto todavia no se envia; la subida a S3 es un paso posterior.
      await createEventRequest(event)
      setIsCreating(false)
      setEvent(emptyEvent)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const openUpcomingEvents = () => {
    setIsViewingUpcoming(true)
    setIsViewingCompleted(false)
  }

  const openCompletedEvents = () => {
    setIsViewingCompleted(true)
    setIsViewingUpcoming(false)
  }

  const formatEventDate = (date) => {
    if (!date) return 'Date to be confirmed'

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
    }).format(new Date(`${date}T00:00:00`))
  }

  if (isViewingUpcoming) {
    return (
      <main className="dashboard events-page">
        <header className="page-header events-list-header">
          <div>
            <button
              className="back-button"
              type="button"
              onClick={() => setIsViewingUpcoming(false)}
            >
              ← Back to dashboard
            </button>
            <h1>Upcoming events</h1>
            <p>All your planned and active events, organized by type</p>
          </div>
          <button className="create-event" type="button" onClick={openCreateForm}>
            <span className="plus-icon" aria-hidden="true">
              +
            </span>
            Create event
          </button>
        </header>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <section className="event-columns" aria-label="Upcoming events by type">
          {eventTypes.map(([type, label]) => {
            const typeEvents = upcomingEvents.filter(
              (savedEvent) => savedEvent.type === type,
            )

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
                        <p>{formatEventDate(savedEvent.date)} · {savedEvent.time}</p>
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
      </main>
    )
  }

  if (isViewingCompleted) {
    return (
      <main className="dashboard events-page">
        <header className="page-header events-list-header">
          <div>
            <button
              className="back-button"
              type="button"
              onClick={() => setIsViewingCompleted(false)}
            >
              ← Back to dashboard
            </button>
            <h1>Completed events</h1>
            <p>Review the details and results of your past events</p>
          </div>
        </header>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

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
      </main>
    )
  }

  if (isCreating) {
    return (
      <main className="dashboard create-page">
        <header className="page-header form-header">
          <h1>Create event</h1>
          <p>Fill in the details to get started</p>
        </header>

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

          <label>
            Event type
            <select
              required
              value={event.type}
              onChange={(formEvent) => updateEvent('type', formEvent.target.value)}
            >
              <option value="">Select an event type</option>
              <option value="conference">Conference</option>
              <option value="business">Business</option>
              <option value="social">Social</option>
              <option value="workshop">Workshop</option>
            </select>
          </label>

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
              onChange={(formEvent) =>
                updateEvent('location', formEvent.target.value)
              }
            />
          </label>

          <label>
            Event photo
            <span className="upload-area">
              <input
                className="file-input"
                type="file"
                accept=".jpg,.jpeg,.png,.gif"
                onChange={(formEvent) =>
                  updateEvent('photo', formEvent.target.files[0] || null)
                }
              />
              <span className="upload-icon" aria-hidden="true">
                □
              </span>
              <strong>
                {event.photo ? event.photo.name : 'Drop photo here or click to upload'}
              </strong>
              <small>JPG, PNG or GIF (max 5MB)</small>
            </span>
          </label>

          <label>
            Description
            <textarea
              rows="4"
              placeholder="Tell people about your event..."
              value={event.description}
              onChange={(formEvent) =>
                updateEvent('description', formEvent.target.value)
              }
            />
          </label>

          <label>
            Expected attendees
            <input
              min="0"
              type="number"
              value={event.attendees}
              onChange={(formEvent) =>
                updateEvent('attendees', formEvent.target.value)
              }
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
                    onChange={(formEvent) =>
                      updateEvent('status', formEvent.target.value)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {isEventInPast && (
              <p className="form-hint">
                Events with a past date can only be marked as completed.
              </p>
            )}
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button className="cancel-button" type="button" onClick={cancelCreate}>
              Cancel
            </button>
            <button className="create-event" type="submit" disabled={isSaving}>
              <span className="plus-icon" aria-hidden="true">
                +
              </span>
              {isSaving ? 'Saving…' : 'Create event'}
            </button>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <header className="page-header">
        <div className="header-top">
          <div>
            <h1>Events</h1>
            <p>Create and manage your events in one place</p>
          </div>

          {currentUser && (
            <div className="user-info" title={currentUser.email}>
              <span className="user-name">{currentUser.full_name}</span>
              {currentUser.tenant_name && (
                <span className="user-tenant">{currentUser.tenant_name}</span>
              )}
            </div>
          )}
        </div>

        <div className="header-actions">
          <button className="create-event" type="button" onClick={openCreateForm}>
            <span className="plus-icon" aria-hidden="true">
              +
            </span>
            Create event
          </button>
          <button className="cancel-button" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section className="statistics" aria-label="Event statistics">
        {[
          ['Total events', statistics.total, 'total', false],
          ['Upcoming', statistics.upcoming, 'upcoming', true],
          ['Completed', statistics.completed, 'completed', true],
        ].map(([label, value, tone, isInteractive]) => (
          <button
            className={isInteractive ? 'stat-card interactive' : 'stat-card'}
            key={label}
            type="button"
            onClick={
              label === 'Upcoming' ? openUpcomingEvents : openCompletedEvents
            }
          >
            <h2>{label}</h2>
            <p className={`stat-value ${tone}`}>{value}</p>
          </button>
        ))}
      </section>

      <StatisticsChart overview={overview} />
    </main>
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
