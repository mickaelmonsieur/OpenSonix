import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { useI18n } from './i18n/index.jsx'
import Dashboard      from './pages/Dashboard.jsx'
import Config         from './pages/Config.jsx'
import Network        from './pages/Network.jsx'
import System         from './pages/System.jsx'
import ChangePassword from './pages/ChangePassword.jsx'

// ── Auth context ─────────────────────────────────────────────────────────────

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function decodeJwt(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

function isExpired(token) {
  const p = decodeJwt(token)
  return !p || p.exp * 1000 < Date.now()
}

// ── Auth provider ─────────────────────────────────────────────────────────────

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('token')
    return t && !isExpired(t) ? t : null
  })

  const tokenRef = useRef(token)
  useEffect(() => { tokenRef.current = token }, [token])

  const saveToken = useCallback((t) => {
    localStorage.setItem('token', t)
    tokenRef.current = t
    setToken(t)
  }, [])

  const logout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    localStorage.removeItem('token')
    tokenRef.current = null
    setToken(null)
  }, [])

  const apiFetch = useCallback(async (url, opts = {}) => {
    const makeHeaders = (t) => ({
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...opts.headers,
    })

    let res = await fetch(url, { ...opts, headers: makeHeaders(tokenRef.current) })

    if (res.status === 401) {
      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' })
      if (refreshRes.ok) {
        const { token: newToken } = await refreshRes.json()
        saveToken(newToken)
        res = await fetch(url, { ...opts, headers: makeHeaders(newToken) })
      } else {
        await logout()
        throw Object.assign(new Error('Session expired'), { status: 401 })
      }
    }

    return res
  }, [saveToken, logout])

  const user = token ? decodeJwt(token) : null

  return (
    <AuthContext.Provider value={{ token, user, saveToken, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Guards ────────────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function RequireComplete({ children }) {
  const { token, user } = useAuth()
  if (!token)                   return <Navigate to="/login" replace />
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />
  return children
}

// ── Navbar ────────────────────────────────────────────────────────────────────

function Navbar() {
  const { logout }  = useAuth()
  const { t }       = useI18n()
  const navigate    = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">OpenSonix</NavLink>
      <div className="navbar-links">
        <NavLink to="/"        end>{t('nav.dashboard')}</NavLink>
        <NavLink to="/config"     >{t('nav.config')}</NavLink>
        <NavLink to="/network"    >{t('nav.network')}</NavLink>
        <NavLink to="/system"     >{t('nav.system')}</NavLink>
      </div>
      <button className="navbar-logout" onClick={handleLogout}>{t('nav.logout')}</button>
    </nav>
  )
}

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
  const { token, user, saveToken } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [form, setForm]   = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  if (token && !user?.mustChangePassword) return <Navigate to="/"               replace />
  if (token &&  user?.mustChangePassword) return <Navigate to="/change-password" replace />

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? t('login.error_login')); return }
      saveToken(body.token)
      navigate(body.mustChangePassword ? '/change-password' : '/', { replace: true })
    } catch {
      setError(t('login.error_server'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>OpenSonix</h1>
        <form onSubmit={handle}>
          <div className="form-row">
            <label>{t('login.username')}</label>
            <input
              autoFocus
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              disabled={busy}
            />
          </div>
          <div className="form-row">
            <label>{t('login.password')}</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              disabled={busy}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t('login.signing_in') : t('login.sign_in')}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/change-password" element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        } />

        <Route path="/*" element={
          <RequireComplete>
            <Navbar />
            <Routes>
              <Route path="/"        element={<Dashboard />} />
              <Route path="/config"  element={<Config />} />
              <Route path="/network" element={<Network />} />
              <Route path="/system"  element={<System />} />
              <Route path="*"        element={<Navigate to="/" replace />} />
            </Routes>
          </RequireComplete>
        } />
      </Routes>
    </AuthProvider>
  )
}
