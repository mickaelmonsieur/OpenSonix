import { useState, useEffect } from 'react'
import { useAuth }             from '../App.jsx'
import { useWebSocket }        from '../hooks/useWebSocket.js'

// ── sub-components ────────────────────────────────────────────────────────────

function ModeBadge({ mode }) {
  return mode === 'SENDER'
    ? <span className="badge-xl green">ÉMETTEUR</span>
    : <span className="badge-xl blue">RÉCEPTEUR</span>
}

function CallBadge({ call }) {
  if (!call)                        return <span className="badge grey">INACTIF</span>
  if (call.status === 'incoming')   return <span className="badge yellow">APPEL ENTRANT</span>
  if (call.status === 'ringing')    return <span className="badge orange">SONNERIE</span>
  if (call.status === 'established') return <span className="badge green">CONNECTÉ</span>
  return <span className="badge grey">—</span>
}

function RegBadge({ reg }) {
  if (reg === 'ok')   return <span className="badge green">ENREGISTRÉ</span>
  if (reg === 'fail') return <span className="badge red">ÉCHEC ENR.</span>
  return <span className="badge grey">—</span>
}

function DaemonBadge({ connected }) {
  return connected
    ? <span className="badge green">EN LIGNE</span>
    : <span className="badge red">HORS LIGNE</span>
}

function VuBar({ value }) {
  const pct = Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100)
  return (
    <div className="vu-track">
      <div className="vu-dim" style={{ width: `${100 - pct}%` }} />
    </div>
  )
}

function VuChannel({ ch, value }) {
  const pct = Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100)
  return (
    <div className="vu-row">
      <span className="vu-ch">{ch}</span>
      <VuBar value={value} />
      <span className="vu-pct">{pct}%</span>
    </div>
  )
}

function VuMeter({ tx, rx }) {
  // Server sends scalar values from amixer (mono). L = R until server sends stereo.
  return (
    <div>
      <div className="vu-section">
        <div className="vu-section-label">IN</div>
        <VuChannel ch="L" value={tx} />
        <VuChannel ch="R" value={tx} />
      </div>
      <div className="vu-section">
        <div className="vu-section-label">OUT</div>
        <VuChannel ch="L" value={rx} />
        <VuChannel ch="R" value={rx} />
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { token, apiFetch } = useAuth()
  const ws = useWebSocket(token)

  // Ground truth from REST, updated once on mount
  const [rest, setRest] = useState({
    mode:             'RECEIVER',
    call:             null,
    baresipConnected: false,
    registration:     null,
    dialUri:          null,
  })
  const [busy, setBusy]         = useState(false)
  const [cmdError, setCmdError] = useState('')

  useEffect(() => {
    apiFetch('/api/status')
      .then(r => r.json())
      .then(data => setRest({
        mode:             data.mode             ?? 'RECEIVER',
        call:             data.call             ?? null,
        baresipConnected: data.baresipConnected ?? false,
        registration:     data.registration     ?? null,
        dialUri:          data.dialUri          ?? null,
      }))
      .catch(() => {})
  }, [])  // apiFetch is stable

  // WS values overlay REST values as events arrive (non-null wins)
  const mode             = rest.mode
  const call             = ws.call             !== null ? ws.call             : rest.call
  const baresipConnected = ws.baresipConnected !== null ? ws.baresipConnected : rest.baresipConnected
  const registration     = ws.registration     !== null ? ws.registration     : rest.registration
  const audioLevel       = ws.audioLevel

  const dialUri      = rest.dialUri
  const isConnected  = call?.status === 'established'
  const isIncoming   = call?.status === 'incoming'
  const isSender     = mode === 'SENDER'

  const cmd = async (endpoint, body = {}) => {
    setBusy(true)
    setCmdError('')
    try {
      const res = await apiFetch(`/api/call/${endpoint}`, {
        method: 'POST',
        body:   JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setCmdError(j.error ?? `Erreur ${res.status}`)
      }
    } catch (e) {
      setCmdError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h2 className="page-title">Dashboard</h2>

      {/* ── Mode + global status ── */}
      <div className="card">
        <div className="card-header">État</div>
        <div className="card-body">
          <table className="status-table">
            <tbody>
              <tr>
                <td>Mode</td>
                <td><ModeBadge mode={mode} /></td>
              </tr>
              <tr>
                <td>Liaison</td>
                <td><CallBadge call={call} /></td>
              </tr>
              {call && (
                <tr>
                  <td>URI distant</td>
                  <td><code>{call.uri || '—'}</code></td>
                </tr>
              )}
              <tr>
                <td>Moteur codec</td>
                <td><DaemonBadge connected={baresipConnected} /></td>
              </tr>
              {isSender && (
                <tr>
                  <td>Enregistrement</td>
                  <td><RegBadge reg={registration} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── VU meter (always visible) ── */}
      <div className="card">
        <div className="card-header">Niveaux audio</div>
        <div className="card-body">
          <VuMeter tx={audioLevel.tx} rx={audioLevel.rx} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="card">
        <div className="card-header">Commandes</div>
        <div className="card-body">
          <div className="btn-group">
            {isSender && !isConnected && (
              <button
                className="btn btn-primary"
                disabled={busy || !baresipConnected || !dialUri}
                onClick={() => cmd('dial', { uri: dialUri })}
                title={!dialUri ? 'Configurer l\'hôte et les identifiants dans Config' : dialUri}
              >
                Appeler
              </button>
            )}
            {isIncoming && (
              <button
                className="btn btn-primary"
                disabled={busy || !baresipConnected}
                onClick={() => cmd('accept')}
              >
                Décrocher
              </button>
            )}
            {(isConnected || isIncoming) && (
              <button
                className="btn btn-danger"
                disabled={busy || !baresipConnected}
                onClick={() => cmd('hangup')}
              >
                Raccrocher
              </button>
            )}
            {!isSender && !isConnected && !isIncoming && (
              <span className="badge grey">En attente d'appel entrant…</span>
            )}
          </div>
          {isSender && !dialUri && (
            <p style={{ marginTop: '.5rem', color: '#856404', fontSize: '.82rem' }}>
              Hôte distant non configuré. Renseignez-le dans <a href="/config">Config</a>.
            </p>
          )}
          {cmdError && <p className="form-error" style={{ marginTop: '.5rem' }}>{cmdError}</p>}
        </div>
      </div>

      {/* ── WebSocket indicator ── */}
      <div style={{ fontSize: '.75rem', color: '#999', marginTop: '.25rem' }}>
        WebSocket : {ws.wsConnected
          ? <span style={{ color: '#2d8a2d' }}>connecté</span>
          : <span style={{ color: '#c0392b' }}>déconnecté — reconnexion…</span>}
      </div>
    </div>
  )
}
