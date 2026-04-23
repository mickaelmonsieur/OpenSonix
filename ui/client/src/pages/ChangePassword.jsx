import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'

function Req({ ok, label }) {
  return (
    <div style={{ fontSize: '.8rem', display: 'flex', gap: '.35rem', alignItems: 'center',
                  color: ok ? '#155724' : '#888' }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{ok ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  )
}

export default function ChangePassword() {
  const { apiFetch, saveToken } = useAuth()
  const navigate = useNavigate()

  const [form,   setForm]   = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [error,  setError]  = useState('')
  const [busy,   setBusy]   = useState(false)
  const [minLen, setMinLen] = useState(12)

  useEffect(() => {
    apiFetch('/api/auth/security-config')
      .then(r => r.json())
      .then(d => { if (d.password_min_length) setMinLen(d.password_min_length) })
      .catch(() => {})
  }, [apiFetch])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  const pw         = form.newPassword
  const hasLen     = pw.length >= minLen
  const hasUpper   = /[A-Z]/.test(pw)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
  const isStrong   = hasLen && hasUpper && hasSpecial

  const submit = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (!isStrong) {
      setError('Le mot de passe ne respecte pas les exigences.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res  = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body:   JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? `Erreur ${res.status}`); return }
      saveToken(body.token)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>Changer le mot de passe</h1>
        <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '.75rem', marginTop: '-.25rem' }}>
          Vous devez définir un nouveau mot de passe avant de continuer.
        </p>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Mot de passe actuel</label>
            <input type="password" value={form.currentPassword}
              onChange={e => set('currentPassword', e.target.value)}
              autoFocus disabled={busy} />
          </div>
          <div className="form-row">
            <label>Nouveau mot de passe</label>
            <input type="password" value={form.newPassword}
              onChange={e => set('newPassword', e.target.value)}
              disabled={busy} />
            {pw.length > 0 && (
              <div style={{ marginTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                <Req ok={hasLen}     label={`Au moins ${minLen} caractères`} />
                <Req ok={hasUpper}   label="Au moins une majuscule" />
                <Req ok={hasSpecial} label="Au moins un caractère spécial (!@#…)" />
              </div>
            )}
          </div>
          <div className="form-row">
            <label>Confirmer</label>
            <input type="password" value={form.confirm}
              onChange={e => set('confirm', e.target.value)}
              disabled={busy} />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Sauvegarde…' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
