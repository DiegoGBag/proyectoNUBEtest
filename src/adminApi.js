import { request } from './api'

// Arma "?a=1&b=2" ignorando los valores vacios.
const query = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

const A = '/api/admin'
const send = (method, path, body) => request(`${A}${path}`, { method, body })

export const adminApi = {
  overview: () => send('GET', '/overview'),
  search: (q) => send('GET', `/search${query({ q })}`),

  tenants: (params) => send('GET', `/tenants${query(params)}`),
  tenant: (id) => send('GET', `/tenants/${id}`),
  createTenant: (body) => send('POST', '/tenants', body),
  updateTenant: (id, body) => send('PUT', `/tenants/${id}`, body),
  deleteTenant: (id) => send('DELETE', `/tenants/${id}?cascade=true`),
  addMember: (tenantId, body) => send('POST', `/tenants/${tenantId}/members`, body),
  setMemberRole: (tenantId, userId, role_name) =>
    send('PUT', `/tenants/${tenantId}/members/${userId}`, { role_name }),
  removeMember: (tenantId, userId) => send('DELETE', `/tenants/${tenantId}/members/${userId}`),

  users: (params) => send('GET', `/users${query(params)}`),
  user: (id) => send('GET', `/users/${id}`),
  createUser: (body) => send('POST', '/users', body),
  updateUser: (id, body) => send('PUT', `/users/${id}`, body),
  assignTenant: (id, body) => send('PUT', `/users/${id}/tenant`, body),
  deleteUser: (id) => send('DELETE', `/users/${id}?cascade=true`),

  events: (params) => send('GET', `/events${query(params)}`),
  createEvent: (body) => send('POST', '/events', body),
  updateEvent: (id, body) => send('PUT', `/events/${id}`, body),
  deleteEvent: (id) => send('DELETE', `/events/${id}`),

  categories: () => send('GET', '/categories'),
  createCategory: (body) => send('POST', '/categories', body),
  updateCategory: (id, body) => send('PUT', `/categories/${id}`, body),
  deleteCategory: (id) => send('DELETE', `/categories/${id}`),

  databaseInfo: () => send('GET', '/database/info'),
  databaseTables: () => send('GET', '/database/tables'),
  tableData: (schema, table, params) =>
    send('GET', `/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}${query(params)}`),

  securityStatus: () => send('GET', '/security/status'),
  securityLogins: () => send('GET', '/security/logins'),
}
