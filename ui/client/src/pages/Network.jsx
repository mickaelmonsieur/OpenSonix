import { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'

const EMPTY = { mode: 'dhcp', ip: '', mask: '', gateway: '', dns1: '', dns2: '', hostname: '' }

export default function Network() {
  const { apiFetch } = useAuth()

  const [original, setOriginal] = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [warning,  setWarning]  = useState('')
  const [success,  setSuccess]  = useState('')
  const [error,    setError]    = useState('')

  useEffect(() => {
    apiFetch('/api/network')
      .then(r => r.json())
      .then(data => { setForm(data); setOriginal(data) })
      .catch(() => setError('Impossible de charger la configuration réseau.'))
  }, [])

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setWarning(''); setSuccess(''); setError('')
  }

  const save = async () => {
    setSaving(true)
    setWarning(''); setSuccess(''); setError('')
    try {
      const res  = await apiFetch('/api/network', { method: 'POST', body: JSON.stringify(form) })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? `Erreur ${res.status}`); return }
      setOriginal({ ...form })
      if (body.warning) setWarning(body.warning)
      else              setSuccess('Configuration réseau sauvegardée.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => { setForm({ ...original }); setWarning(''); setSuccess(''); setError('') }

  const isStatic  = form.mode === 'static'
  const hasChange = original && JSON.stringify(form) !== JSON.stringify(original)

  return (
    <div className="page">
      <h2 className="page-title">Réseau</h2>

      {/* ── Warning banner (IP changed) ── */}
      {warning && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', color: '#856404',
          padding: '.75rem 1rem', marginBottom: '1rem',
          display: 'flex', gap: '.75rem', alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⚠</span>
          <div>
            <strong>Attention — changement d'adresse IP</strong><br />
            <span style={{ fontSize: '.88rem' }}>{warning}</span>
          </div>
        </div>
      )}

      {success && (
        <div style={{
          background: '#d4edda', border: '1px solid #b1dfbb', color: '#155724',
          padding: '.5rem .75rem', marginBottom: '1rem',
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24',
          padding: '.5rem .75rem', marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {/* ── IP config ── */}
      <div className="card">
        <div className="card-header">Configuration IP</div>
        <div className="card-body">
          <div className="form-row">
            <label>Mode</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {[['dhcp', 'DHCP (automatique)'], ['static', 'Adresse statique']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                  <input type="radio" name="ipmode" value={val}
                    checked={form.mode === val}
                    onChange={() => set('mode', val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {isStatic && (
            <>
              <div className="form-row">
                <label>Adresse IP</label>
                <input type="text" value={form.ip}
                  onChange={e => set('ip', e.target.value)}
                  placeholder="10.0.1.100" />
              </div>
              <div className="form-row">
                <label>Masque de sous-réseau</label>
                <input type="text" value={form.mask}
                  onChange={e => set('mask', e.target.value)}
                  placeholder="255.255.255.0" />
              </div>
              <div className="form-row">
                <label>Passerelle</label>
                <input type="text" value={form.gateway}
                  onChange={e => set('gateway', e.target.value)}
                  placeholder="10.0.1.1" />
              </div>
              <div className="form-row">
                <label>DNS primaire</label>
                <input type="text" value={form.dns1}
                  onChange={e => set('dns1', e.target.value)}
                  placeholder="8.8.8.8" />
              </div>
              <div className="form-row">
                <label>DNS secondaire</label>
                <input type="text" value={form.dns2}
                  onChange={e => set('dns2', e.target.value)}
                  placeholder="8.8.4.4" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Hostname ── */}
      <div className="card">
        <div className="card-header">Identification</div>
        <div className="card-body">
          <div className="form-row">
            <label>Nom d'hôte</label>
            <input type="text" value={form.hostname}
              onChange={e => set('hostname', e.target.value)}
              placeholder="opensonix" />
          </div>
        </div>
      </div>

      <div className="btn-group">
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        <button className="btn" disabled={saving || !hasChange} onClick={cancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
