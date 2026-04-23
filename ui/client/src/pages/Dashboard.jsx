import { useState, useEffect } from 'react'
import { useAuth }             from '../App.jsx'
import { useI18n }             from '../i18n/index.jsx'
import { useWebSocket }        from '../hooks/useWebSocket.js'

// ── sub-components ────────────────────────────────────────────────────────────

function ModeBadge({ mode }) {
  const { t } = useI18n()
  return mode === 'SENDER'
    ? <span className="badge-xl green">{t('dashboard.badge_sender')}</span>
    : <span className="badge-xl blue">{t('dashboard.badge_receiver')}</span>
}

function CallBadge({ call }) {
  const { t } = useI18n()
  if (!call)                         return <span className="badge grey">{t('dashboard.badge_inactive')}</span>
  if (call.status === 'incoming')    return <span className="badge yellow">{t('dashboard.badge_incoming')}</span>
  if (call.status === 'ringing')     return <span className="badge orange">{t('dashboard.badge_ringing')}</span>
  if (call.status === 'established') return <span className="badge green">{t('dashboard.badge_connected')}</span>
  return <span className="badge grey">—</span>
}

function RegBadge({ reg }) {
  const { t } = useI18n()
  if (reg === 'ok')   return <span className="badge green">{t('dashboard.badge_registered')}</span>
  if (reg === 'fail') return <span className="badge red">{t('dashboard.badge_reg_fail')}</span>
  return <span className="badge grey">—</span>
}

function DaemonBadge({ connected }) {
  const { t } = useI18n()
  return connected
    ? <span className="badge green">{t('dashboard.badge_online')}</span>
    : <span className="badge red">{t('dashboard.badge_offline')}</span>
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
  const { t } = useI18n()
  const ws = useWebSocket(token)

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

  const mode             = rest.mode
  const call             = ws.call             !== null ? ws.call             : rest.call
  const baresipConnected = ws.baresipConnected !== null ? ws.baresipConnected : rest.baresipConnected
  const registration     = ws.registration     !== null ? ws.registration     : rest.registration
  const audioLevel       = ws.audioLevel

  const dialUri     = rest.dialUri
  const isConnected = call?.status === 'established'
  const isIncoming  = call?.status === 'incoming'
  const isSender    = mode === 'SENDER'

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
        setCmdError(j.error ?? `Error ${res.status}`)
      }
    } catch (e) {
      setCmdError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h2 className="page-title">{t('dashboard.title')}</h2>

      {/* ── Mode + global status ── */}
      <div className="card">
        <div className="card-header">{t('dashboard.card_status')}</div>
        <div className="card-body">
          <table className="status-table">
            <tbody>
              <tr>
                <td>{t('dashboard.row_mode')}</td>
                <td><ModeBadge mode={mode} /></td>
              </tr>
              <tr>
                <td>{t('dashboard.row_link')}</td>
                <td><CallBadge call={call} /></td>
              </tr>
              {call && (
                <tr>
                  <td>{t('dashboard.row_remote_uri')}</td>
                  <td><code>{call.uri || '—'}</code></td>
                </tr>
              )}
              <tr>
                <td>{t('dashboard.row_codec')}</td>
                <td><DaemonBadge connected={baresipConnected} /></td>
              </tr>
              {isSender && (
                <tr>
                  <td>{t('dashboard.row_registration')}</td>
                  <td><RegBadge reg={registration} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── VU meter (always visible) ── */}
      <div className="card">
        <div className="card-header">{t('dashboard.card_audio')}</div>
        <div className="card-body">
          <VuMeter tx={audioLevel.tx} rx={audioLevel.rx} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="card">
        <div className="card-header">{t('dashboard.card_controls')}</div>
        <div className="card-body">
          <div className="btn-group">
            {isSender && !isConnected && (
              <button
                className="btn btn-primary"
                disabled={busy || !baresipConnected || !dialUri}
                onClick={() => cmd('dial', { uri: dialUri })}
                title={!dialUri ? t('dashboard.dial_title') : dialUri}
              >
                {t('dashboard.dial')}
              </button>
            )}
            {isIncoming && (
              <button
                className="btn btn-primary"
                disabled={busy || !baresipConnected}
                onClick={() => cmd('accept')}
              >
                {t('dashboard.answer')}
              </button>
            )}
            {(isConnected || isIncoming) && (
              <button
                className="btn btn-danger"
                disabled={busy || !baresipConnected}
                onClick={() => cmd('hangup')}
              >
                {t('dashboard.hangup')}
              </button>
            )}
            {!isSender && !isConnected && !isIncoming && (
              <span className="badge grey">{t('dashboard.waiting')}</span>
            )}
          </div>
          {isSender && !dialUri && (
            <p style={{ marginTop: '.5rem', color: '#856404', fontSize: '.82rem' }}>
              {t('dashboard.no_host_hint')}<a href="/config">Config</a>.
            </p>
          )}
          {cmdError && <p className="form-error" style={{ marginTop: '.5rem' }}>{cmdError}</p>}
        </div>
      </div>

      {/* ── WebSocket indicator ── */}
      <div style={{ fontSize: '.75rem', color: '#999', marginTop: '.25rem' }}>
        {t('dashboard.ws_label')}{ws.wsConnected
          ? <span style={{ color: '#2d8a2d' }}>{t('dashboard.ws_connected')}</span>
          : <span style={{ color: '#c0392b' }}>{t('dashboard.ws_disconnected')}</span>}
      </div>
    </div>
  )
}
