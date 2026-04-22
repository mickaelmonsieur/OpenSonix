import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'

export default function ChangePassword() {
  const { apiFetch, saveToken } = useAuth()
  const navigate = useNavigate()

  const [form,  setForm]  = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy,  setBusy]  = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.')
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
