import { useState } from 'react'
import './App.css'

const initialStatistics = {
  total: 12,
  upcoming: 5,
  completed: 7,
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
  const [isCreating, setIsCreating] = useState(false)
  const [isViewingUpcoming, setIsViewingUpcoming] = useState(false)
  const [isViewingCompleted, setIsViewingCompleted] = useState(false)
  const [statistics, setStatistics] = useState(initialStatistics)
  const [event, setEvent] = useState(emptyEvent)
  const [savedEvents, setSavedEvents] = useState([])

  const updateEvent = (field, value) => {
    setEvent((currentEvent) => ({ ...currentEvent, [field]: value }))
  }

  const openCreateForm = () => {
    setEvent(emptyEvent)
    setIsViewingUpcoming(false)
    setIsViewingCompleted(false)
    setIsCreating(true)
  }

  const cancelCreate = () => {
    setIsCreating(false)
    setEvent(emptyEvent)
  }

  const createEvent = (formEvent) => {
    formEvent.preventDefault()

    const newEvent = {
      ...event,
      id: crypto.randomUUID(),
      attendees: Number(event.attendees) || 0,
    }
    const hasPassed = event.date < new Date().toISOString().slice(0, 10)
    const isCompleted = event.status === 'completed' || hasPassed

    setSavedEvents((currentEvents) => [...currentEvents, newEvent])
    setStatistics((currentStatistics) => ({
      ...currentStatistics,
      total: currentStatistics.total + 1,
      upcoming: isCompleted
        ? currentStatistics.upcoming
        : currentStatistics.upcoming + 1,
      completed: isCompleted
        ? currentStatistics.completed + 1
        : currentStatistics.completed,
    }))
    setIsCreating(false)
    setEvent(emptyEvent)
  }

  const openUpcomingEvents = () => {
    setIsViewingUpcoming(true)
    setIsViewingCompleted(false)
  }

  const openCompletedEvents = () => {
    setIsViewingCompleted(true)
    setIsViewingUpcoming(false)
  }

  const isPastEvent = (savedEvent) =>
    savedEvent.date < new Date().toISOString().slice(0, 10)

  const formatEventDate = (date) => {
    if (!date) return 'Date to be confirmed'

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
    }).format(new Date(`${date}T00:00:00`))
  }

  if (isViewingUpcoming) {
    const upcomingEvents = savedEvents.filter(
      (savedEvent) => savedEvent.status !== 'completed',
    )

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
    const completedEvents = savedEvents.filter(
      (savedEvent) => savedEvent.status === 'completed' || isPastEvent(savedEvent),
    )

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
          <button className="create-event" type="button" onClick={openCreateForm}>
            <span className="plus-icon" aria-hidden="true">
              +
            </span>
            Create event
          </button>
        </header>

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
                    {savedEvent.status === 'completed' ? 'Completed' : 'Past date'}
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
                    onChange={(formEvent) =>
                      updateEvent('status', formEvent.target.value)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-actions">
            <button className="cancel-button" type="button" onClick={cancelCreate}>
              Cancel
            </button>
            <button className="create-event" type="submit">
              <span className="plus-icon" aria-hidden="true">
                +
              </span>
              Create event
            </button>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <header className="page-header">
        <div>
          <h1>Events</h1>
          <p>Create and manage your events in one place</p>
        </div>

        <button className="create-event" type="button" onClick={openCreateForm}>
          <span className="plus-icon" aria-hidden="true">
            +
          </span>
          Create event
        </button>
      </header>

      <section className="statistics" aria-label="Event statistics">
        {[
          ['Total events', statistics.total, false, false],
          ['Upcoming', statistics.upcoming, true, true],
          ['Completed', statistics.completed, false, true],
        ].map(([label, value, accent, isInteractive]) => (
          <button
            className={isInteractive ? 'stat-card interactive' : 'stat-card'}
            key={label}
            type="button"
            onClick={
              label === 'Upcoming' ? openUpcomingEvents : openCompletedEvents
            }
          >
            <h2>{label}</h2>
            <p className={accent ? 'stat-value accent' : 'stat-value'}>{value}</p>
          </button>
        ))}
      </section>
    </main>
  )
}

export default App
