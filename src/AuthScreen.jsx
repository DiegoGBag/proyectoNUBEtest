import { useState } from 'react'
import { login, register } from './api'

const emptyForm = { fullName: '', tenantName: '', email: '', password: '' }

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register')
    setError('')
  }

  const submit = async (formEvent) => {
    formEvent.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      if (isRegister) await register(form)
      else await login(form.email, form.password)
      onAuthenticated()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="dashboard create-page">
      <header className="page-header form-header">
        <h1>{isRegister ? 'Create account' : 'Sign in'}</h1>
        <p>
          {isRegister
            ? 'Set up your organization and your first user'
            : 'Welcome back to Events'}
        </p>
      </header>

      <form className="event-form" onSubmit={submit}>
        {isRegister && (
          <>
            <label>
              Full name
              <input
                required
                type="text"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
              />
            </label>
            <label>
              Organization name
              <input
                required
                type="text"
                value={form.tenantName}
                onChange={(e) => update('tenantName', e.target.value)}
              />
            </label>
          </>
        )}

        <label>
          {isRegister ? 'Email' : 'Email or username'}
          <input
            required
            type={isRegister ? 'email' : 'text'}
            autoComplete={isRegister ? 'email' : 'username'}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            required
            type="password"
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="cancel-button" type="button" onClick={switchMode}>
            {isRegister ? 'I already have an account' : 'Create an account'}
          </button>
          <button className="create-event" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </div>
      </form>
    </main>
  )
}

export default AuthScreen
