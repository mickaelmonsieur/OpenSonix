import { useCallback, useState, useEffect } from 'react'
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

function formatCallDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const STATUS_POLL_MS = 2000

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
  const [now, setNow]           = useState(Date.now())

  const refreshStatus = useCallback(async () => {
    const r = await apiFetch('/api/status')
    const data = await r.json()
    setRest({
      mode:             data.mode             ?? 'RECEIVER',
      call:             data.call             ?? null,
      baresipConnected: data.baresipConnected ?? false,
      registration:     data.registration     ?? null,
      dialUri:          data.dialUri          ?? null,
    })
    return data
  }, [apiFetch])

  useEffect(() => {
    refreshStatus().catch(() => {})
    const timer = setInterval(() => {
      refreshStatus().catch(() => {})
    }, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [refreshStatus])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const mode             = rest.mode
  const call             = ws.call !== undefined ? ws.call : rest.call
  const baresipConnected = ws.baresipConnected !== null ? ws.baresipConnected : rest.baresipConnected
  const audioLevel       = ws.audioLevel

  const dialUri     = rest.dialUri
  const isConnected = call?.status === 'established'
  const isIncoming  = call?.status === 'incoming'
  const isSender    = mode === 'SENDER'
  const callDuration = isConnected && call.startedAt
    ? (now - new Date(call.startedAt).getTime()) / 1000
    : 0

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
        return
      }
      await refreshStatus()
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
              {isConnected && call.startedAt && (
                <>
                  <tr>
                    <td>{t('dashboard.row_established_at')}</td>
                    <td>{formatCallDate(call.startedAt)}</td>
                  </tr>
                  <tr>
                    <td>{t('dashboard.row_duration')}</td>
                    <td><code>{formatDuration(callDuration)}</code></td>
                  </tr>
                </>
              )}
              <tr>
                <td>{t('dashboard.row_codec')}</td>
                <td><DaemonBadge connected={baresipConnected} /></td>
              </tr>
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
            {isSender && (isConnected || isIncoming) && (
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
