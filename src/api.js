// Cada entorno se compila con su propio modo de Vite (development / test / production)
// y su propio VITE_API_URL:
//   development -> .env.development  (API local en http://localhost:8000)
//   test        -> variable TEST_API_URL del repo en GitHub (la inyecta el workflow)
//   production  -> variable PROD_API_URL del repo en GitHub (la inyecta el workflow)
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')

// Pruebas y produccion se publican bajo el mismo dominio (github.io), asi que comparten
// localStorage. El nombre del entorno en la llave evita que la sesion de uno pise la del otro.
export const APP_ENV = import.meta.env.MODE
const TOKEN_KEY = `events_token_${APP_ENV}`

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// El rol sale del payload del JWT solo para decidir que pantalla mostrar; la API
// valida el token en cada peticion, asi que alterarlo aqui no da acceso a nada.
export const getRole = () => {
  try {
    const payload = getToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role ?? 'user'
  } catch {
    return null
  }
}

export async function request(path, { method = 'GET', body } = {}) {
  const headers = {}
  const token = getToken()
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the server. Is the API running?')
  }

  if (!response.ok) {
    // Token vencido o invalido: App escucha este evento y regresa al login.
    if (response.status === 401 && token) {
      clearToken()
      window.dispatchEvent(new Event('auth:logout'))
    }
    let message = `Request failed (${response.status})`
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail)) {
        message = data.detail.map((item) => item.msg).join('. ')
      }
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(message)
  }

  return response.status === 204 ? null : response.json()
}

// --- Auth --------------------------------------------------------------------

export async function login(email, password) {
  const data = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  setToken(data.access_token)
}

export async function register({ fullName, email, password, tenantName }) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: { full_name: fullName, email, password, tenant_name: tenantName },
  })
  setToken(data.access_token)
}

export const getCurrentUser = () => request('/api/auth/me')

export const isMasterAdmin = () => getRole() === 'master'

// --- Events ------------------------------------------------------------------

// La API guarda y devuelve UTC (sin zona, ej. "2026-10-06T01:00:00").
const parseUtc = (value) =>
  new Date(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`)

const pad = (n) => String(n).padStart(2, '0')

// Convierte un evento de la API a la forma que usa la interfaz (fecha y hora locales).
function toEvent(apiEvent) {
  const date = parseUtc(apiEvent.event_date)
  return {
    id: apiEvent.event_id,
    name: apiEvent.name,
    type: apiEvent.event_type,
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    location: apiEvent.location,
    description: apiEvent.description || '',
    attendees: apiEvent.expected_attendees,
    status: apiEvent.status,
    displayStatus: apiEvent.display_status,
  }
}

export const getStats = async () => {
  const data = await request('/api/events/stats')
  return {
    total: data.total_events,
    upcoming: data.upcoming_events,
    completed: data.completed_events,
  }
}

export const getOverview = () => request('/api/events/overview')

export const getUpcomingEvents = async () =>
  (await request('/api/events/upcoming')).map(toEvent)

export const getCompletedEvents = async () =>
  (await request('/api/events/completed')).map(toEvent)

export const createEvent = (form) =>
  request('/api/events', {
    method: 'POST',
    body: {
      name: form.name.trim(),
      event_type: form.type,
      // Fecha y hora locales del formulario -> instante UTC
      event_date: new Date(`${form.date}T${form.time}`).toISOString(),
      location: form.location.trim(),
      description: form.description.trim() || null,
      expected_attendees: Number(form.attendees) || 0,
      status: form.status,
    },
  })
