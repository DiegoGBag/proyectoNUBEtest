import './shell.css'

const ICONS = {
  overview: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
  tenants: <path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1M3 21h18" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  upcoming: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  completed: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  tag: <path d="M3 12V4a1 1 0 011-1h8l9 9-9 9zM8 8h.01" />,
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  create: <path d="M12 5v14M5 12h14" />,
  logout: <path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9" />,
  categories: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  activity: <path d="M2 12h4l3-8 5 16 3-8h5" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  security: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4" />,
}

export function Icon({ name, className = 'app-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

// Layout comun de todo el software: sidebar con degradado + cabecera + contenido.
// nav: [{ id, label, icon }]; user: { name, lines: [..], title } | null
function Shell({ brand, nav, active, onNavigate, title, subtitle, user, onLogout, children }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <p className="app-brand">{brand}</p>
        <nav className="app-nav" aria-label="Main sections">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === active ? 'active' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
          <button type="button" className="app-nav-logout" onClick={onLogout}>
            <Icon name="logout" />
            Log out
          </button>
        </nav>
        <p className="app-tagline">
          Plan Every Event
          <br />
          With <strong>Confidence</strong>
        </p>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="app-session">
            {user && (
              <div className="app-user" title={user.title}>
                <span className="app-avatar" aria-hidden="true">
                  {user.name?.charAt(0).toUpperCase()}
                </span>
                <div className="app-user-details">
                  <strong>{user.name}</strong>
                  {user.lines.filter(Boolean).map((line, index) => (
                    <span key={line} className={index > 0 ? 'mono' : undefined}>
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {children}
      </main>
    </div>
  )
}

export default Shell
