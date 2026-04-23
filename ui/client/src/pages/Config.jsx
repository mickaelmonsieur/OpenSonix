import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../App.jsx'

const VOLUMES = Array.from({ length: 21 }, (_, i) => i * 5)

const BITRATES = [
  { value: '32000',  label: '32 kbps' },
  { value: '64000',  label: '64 kbps' },
  { value: '96000',  label: '96 kbps' },
  { value: '128000', label: '128 kbps' },
  { value: '192000', label: '192 kbps' },
  { value: '256000', label: '256 kbps' },
]

function DeviceSelect({ value, options, onChange }) {
  const list = options.includes(value) ? options : [value, ...options].filter(Boolean)
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {list.length === 0
        ? <option value="">— aucun périphérique détecté —</option>
        : list.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  )
}

function Banner({ ok, message, onDismiss }) {
  if (!message) return null
  const s = ok
    ? { background: '#d4edda', border: '1px solid #b1dfbb', color: '#155724' }
    : { background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24' }
  return (
    <div style={{ ...s, padding: '.5rem .75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>✕</button>
    </div>
  )
}

// Monospaced credential display with a one-click copy button
function CredField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="form-row">
      <label>{label}</label>
      <code style={{ fontFamily: 'monospace', fontSize: '.85rem', letterSpacing: '.04em', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ccc', userSelect: 'all' }}>
        {value ?? '…'}
      </code>
      <button className="btn" style={{ padding: '2px 8px', fontSize: '.78rem', marginLeft: '.4rem' }} onClick={copy} title="Copier">
        {copied ? '✓' : 'Copier'}
      </button>
    </div>
  )
}

export default function Config() {
  const { apiFetch } = useAuth()

  // ── config form (keys saved via POST /api/config) ─────────────────────────
  const [original, setOriginal] = useState(null)
  const [form,     setForm]     = useState(null)
  const [devices,  setDevices]  = useState({ playback: [], capture: [] })

  // ── SIP remote form (saved via POST /api/config/sip) ─────────────────────
  const [sipOrig,  setSipOrig]  = useState(null)
  const [sipForm,  setSipForm]  = useState({ registrar: '', remote_user: '', remote_password: '' })

  // ── local SIP credentials (read-only, updated after rotate) ──────────────
  const [sipCreds, setSipCreds] = useState({ username: null, password: null })
  const [localIp,  setLocalIp]  = useState(null)

  const [saving,   setSaving]   = useState(false)
  const [rotating, setRotating] = useState(false)
  const [banner,   setBanner]   = useState(null)

  const load = useCallback(() => {
    apiFetch('/api/config')
      .then(r => r.json())
      .then(({ devices: devs, sip, localIp, ...cfg }) => {
        setDevices(devs ?? { playback: [], capture: [] })
        setOriginal(cfg)
        setForm(cfg)
        const sipData = {
          registrar:       sip?.registrar       ?? '',
          remote_user:     sip?.remote_user     ?? '',
          remote_password: sip?.remote_password ?? '',
        }
        setSipOrig(sipData)
        setSipForm(sipData)
        setSipCreds({ username: sip?.username ?? null, password: sip?.password ?? null })
        setLocalIp(localIp ?? null)
      })
      .catch(() => setBanner({ ok: false, message: 'Impossible de charger la configuration.' }))
  }, [apiFetch])

  useEffect(() => { load() }, [load])

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setS = (key, val) => setSipForm(f => ({ ...f, [key]: val }))

  const changedConfigKeys = form && original
    ? Object.keys(form).filter(k => form[k] !== original[k])
    : []

  const sipChanged = sipOrig && (
    sipForm.registrar       !== sipOrig.registrar       ||
    sipForm.remote_user     !== sipOrig.remote_user     ||
    sipForm.remote_password !== sipOrig.remote_password
  )

  const hasChanges = changedConfigKeys.length > 0 || sipChanged

  const save = async () => {
    if (!hasChanges) { setBanner({ ok: true, message: 'Aucune modification.' }); return }
    setSaving(true)
    setBanner(null)
    try {
      // Save changed config keys sequentially
      for (const key of changedConfigKeys) {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          body:   JSON.stringify({ key, value: form[key] }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Erreur sur "${key}" (${res.status})`)
        }
      }
      setOriginal({ ...form })

      // Save SIP remote data if changed
      if (sipChanged) {
        const res = await apiFetch('/api/config/sip', {
          method: 'POST',
          body:   JSON.stringify(sipForm),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Erreur liaison (${res.status})`)
        }
        setSipOrig({ ...sipForm })
      }

      setBanner({ ok: true, message: 'Configuration sauvegardée.' })
    } catch (e) {
      setBanner({ ok: false, message: e.message })
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setForm({ ...original })
    setSipForm({ ...sipOrig })
    setBanner(null)
  }

  const rotate = async () => {
    if (!confirm('Régénérer les identifiants ?\n\nToute paire existante devra être reconfigurée avec les nouvelles valeurs.')) return
    setRotating(true)
    setBanner(null)
    try {
      const res  = await apiFetch('/api/config/sip/rotate', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`)
      setSipCreds({ username: body.username, password: body.password })
      setBanner({ ok: true, message: 'Identifiants régénérés. Reconfigurez l\'appareil distant.' })
    } catch (e) {
      setBanner({ ok: false, message: e.message })
    } finally {
      setRotating(false)
    }
  }

  if (!form) {
    return (
      <div className="page">
        <h2 className="page-title">Configuration</h2>
        {banner ? <Banner {...banner} onDismiss={() => setBanner(null)} /> : <p>Chargement…</p>}
      </div>
    )
  }

  return (
    <div className="page">
      <h2 className="page-title">Configuration</h2>

      <Banner {...(banner ?? {})} onDismiss={() => setBanner(null)} />

      {/* ── Mode ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Mode de fonctionnement</div>
        <div className="card-body">
          <div className="form-row">
            <label>Mode</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {[['RECEIVER', 'Récepteur'], ['SENDER', 'Émetteur']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                  <input type="radio" name="mode" value={val}
                    checked={form.mode === val}
                    onChange={() => setF('mode', val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {form.mode === 'SENDER' && (
            <>
              <div style={{ borderTop: '1px solid #e8e8e8', margin: '.6rem 0' }} />
              <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.6rem' }}>
                Renseignez les identifiants de l'appareil <strong>récepteur</strong> distant.
              </p>
              <div className="form-row">
                <label>IP distante</label>
                <input type="text" value={sipForm.registrar}
                  onChange={e => setS('registrar', e.target.value)}
                  placeholder="10.0.1.11" style={{ width: 200 }} />
              </div>
              <div className="form-row">
                <label>Login distant</label>
                <input type="text" value={sipForm.remote_user}
                  onChange={e => setS('remote_user', e.target.value)}
                  placeholder="a1b2c3d4…" style={{ width: 260, fontFamily: 'monospace' }} />
              </div>
              <div className="form-row">
                <label>Mot de passe distant</label>
                <input type="text" value={sipForm.remote_password}
                  onChange={e => setS('remote_password', e.target.value)}
                  placeholder="e5f6…" style={{ width: 260, fontFamily: 'monospace' }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Identifiants de cet appareil (récepteur uniquement) ─────── */}
      {form.mode === 'RECEIVER' && (
        <div className="card">
          <div className="card-header">Identifiants de cet appareil</div>
          <div className="card-body">
            <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.75rem' }}>
              Renseignez ces trois valeurs dans l'appareil émetteur pour établir la liaison.
            </p>
            <CredField label="Adresse IP"    value={localIp ?? '…'} />
            <CredField label="Login"         value={sipCreds.username} />
            <CredField label="Mot de passe"  value={sipCreds.password} />
            <div style={{ marginTop: '.75rem' }}>
              <button className="btn btn-danger" onClick={rotate} disabled={rotating}
                style={{ fontSize: '.82rem' }}>
                {rotating ? 'Régénération…' : 'Régénérer les identifiants'}
              </button>
              <span style={{ fontSize: '.78rem', color: '#856404', marginLeft: '.75rem' }}>
                ⚠ Toute paire existante devra être reconfigurée
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Transport ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Transport</div>
        <div className="card-body">
          <div className="form-row">
            <label>Port de liaison</label>
            <input type="number" min="1024" max="65535"
              value={form.sip_port}
              onChange={e => setF('sip_port', e.target.value)}
              style={{ width: 100 }} />
          </div>
        </div>
      </div>

      {/* ── Audio ────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Audio</div>
        <div className="card-body">
          <div className="form-row">
            <label>Entrée (capture)</label>
            <DeviceSelect value={form.audio_device_in} options={devices.capture}
              onChange={v => setF('audio_device_in', v)} />
          </div>
          <div className="form-row">
            <label>Sortie (lecture)</label>
            <DeviceSelect value={form.audio_device_out} options={devices.playback}
              onChange={v => setF('audio_device_out', v)} />
          </div>
          <div className="form-row">
            <label>Volume capture</label>
            <select value={form.capture_volume} onChange={e => setF('capture_volume', e.target.value)}>
              {VOLUMES.map(v => <option key={v} value={String(v)}>{v} %</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Volume lecture</label>
            <select value={form.playback_volume} onChange={e => setF('playback_volume', e.target.value)}>
              {VOLUMES.map(v => <option key={v} value={String(v)}>{v} %</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Codec OPUS ───────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Codec OPUS</div>
        <div className="card-body">
          <div className="form-row">
            <label>Débit</label>
            <select value={form.opus_bitrate} onChange={e => setF('opus_bitrate', e.target.value)}>
              {BITRATES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Stéréo</label>
            <input type="checkbox"
              checked={form.opus_stereo === 'true'}
              onChange={e => setF('opus_stereo', e.target.checked ? 'true' : 'false')}
              style={{ width: 'auto', accentColor: '#1c3557' }} />
          </div>
          <div className="form-row">
            <label>FEC (correction d'erreur)</label>
            <input type="checkbox"
              checked={form.opus_fec === 'true'}
              onChange={e => setF('opus_fec', e.target.checked ? 'true' : 'false')}
              style={{ width: 'auto', accentColor: '#1c3557' }} />
          </div>
        </div>
      </div>

      <div className="btn-group">
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Sauvegarde…' : `Sauvegarder${hasChanges ? ` (${changedConfigKeys.length + (sipChanged ? 1 : 0)})` : ''}`}
        </button>
        <button className="btn" disabled={saving || !hasChanges} onClick={cancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
