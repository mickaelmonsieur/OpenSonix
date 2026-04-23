import { useState, useEffect, useCallback } from 'react'
import { useNavigate }                       from 'react-router-dom'
import { useAuth }                           from '../App.jsx'
import { useI18n, LANGUAGES }               from '../i18n/index.jsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(s, t) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}${t('system.day_short')}`)
  if (h || d) parts.push(`${h}${t('system.hour_short')}`)
  parts.push(`${m}${t('system.minute_short')}`)
  return parts.join(' ')
}

function fmtMem(bytes, t) { return `${Math.round(bytes / 1024 / 1024)} ${t('common.unit_mb')}` }

function fmtLoad(v) { return v == null ? '—' : v.toFixed(2) }

// ── SystemInfo ────────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{ color: '#666', whiteSpace: 'nowrap', paddingRight: '1rem', paddingBottom: '.3rem', verticalAlign: 'top' }}>{label}</td>
      <td style={{ fontFamily: 'monospace', fontSize: '.85rem', paddingBottom: '.3rem' }}>{value ?? '—'}</td>
    </tr>
  )
}

function SystemInfo({ apiFetch }) {
  const { t, locale } = useI18n()
  const [info, setInfo] = useState(null)

  const load = useCallback(() => {
    apiFetch('/api/system/info').then(r => r.json()).then(setInfo).catch(() => {})
  }, [apiFetch])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  if (!info) return <p style={{ fontSize: '.85rem', color: '#888' }}>{t('common.loading')}</p>

  const usedMem = info.memory.total - info.memory.free
  const netLabel = info.network.iface
    ? `${info.network.iface} — ${info.network.state === 'up' ? (info.network.speed ? `${info.network.speed} Mbps` : 'up') : info.network.state}`
    : '—'
  const datetime = info.datetime
    ? new Date(info.datetime).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' })
    : '—'

  const v = info.versions ?? {}

  return (
    <>
      <table style={{ borderCollapse: 'collapse', fontSize: '.88rem', width: '100%', marginBottom: '1rem' }}>
        <tbody>
          <InfoRow label={t('system.uptime')}    value={fmtUptime(info.uptime, t)} />
          <InfoRow label={t('system.load')}      value={`${fmtLoad(info.load.m1)} / ${fmtLoad(info.load.m5)} / ${fmtLoad(info.load.m15)}`} />
          <InfoRow label={t('system.cpu_cores')} value={info.cpus} />
          <InfoRow label={t('system.memory')}    value={t('system.mem_format', { used: fmtMem(usedMem, t), total: fmtMem(info.memory.total, t) })} />
          <InfoRow label={t('system.network')}   value={netLabel} />
          <InfoRow label={t('system.datetime')}  value={datetime} />
          <InfoRow label={t('system.os')}        value={info.osName} />
        </tbody>
      </table>

      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: '.75rem' }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.4rem' }}>
          {t('system.software_vers')}
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: '.88rem', width: '100%' }}>
          <tbody>
            <InfoRow label={t('system.firmware')}    value={v.firmware} />
            <InfoRow label={t('system.kernel')}      value={v.kernel} />
            <InfoRow label={t('system.node')}        value={v.node} />
            <InfoRow label={t('system.codec_engine')}value={v.baresip} />
            <InfoRow label={t('system.libopus')}     value={v.libopus} />
            <InfoRow label={t('system.alsa')}        value={v.alsa} />
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── DateTimeConfig ────────────────────────────────────────────────────────────

function DateTimeConfig({ apiFetch }) {
  const { t } = useI18n()
  const [timezones, setTimezones] = useState([])
  const [tz,        setTz]        = useState('')
  const [ntp1,      setNtp1]      = useState('')
  const [ntp2,      setNtp2]      = useState('')
  const [tzSaved,   setTzSaved]   = useState(false)
  const [ntpSaved,  setNtpSaved]  = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/system/timezones').then(r => r.json()),
      apiFetch('/api/system/clock').then(r => r.json()),
    ]).then(([tzData, clockData]) => {
      setTimezones(tzData.timezones ?? [])
      setTz(clockData.timezone)
      setNtp1(clockData.ntp_server_1)
      setNtp2(clockData.ntp_server_2)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [apiFetch])

  const saveTz = async () => {
    await apiFetch('/api/system/timezone', { method: 'POST', body: JSON.stringify({ timezone: tz }) })
    setTzSaved(true); setTimeout(() => setTzSaved(false), 2000)
  }

  const saveNtp = async () => {
    await apiFetch('/api/system/ntp', { method: 'POST', body: JSON.stringify({ server1: ntp1, server2: ntp2 }) })
    setNtpSaved(true); setTimeout(() => setNtpSaved(false), 2000)
  }

  const sectionLabel = {
    fontSize: '.72rem', fontWeight: 700, color: '#888',
    textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.5rem',
  }

  if (loading) return <p style={{ fontSize: '.85rem', color: '#888' }}>{t('common.loading')}</p>

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={sectionLabel}>{t('system.timezone')}</div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <select value={tz} onChange={e => setTz(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '.88rem',
                     border: '1px solid #bbb', padding: '.3rem .4rem' }}>
            {timezones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <button className="btn btn-primary" onClick={saveTz}>
            {tzSaved ? t('common.applied') : t('common.apply')}
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: '.85rem' }}>
        <div style={sectionLabel}>{t('system.ntp_servers')}</div>
        {[ntp1, ntp2].map((v, i) => (
          <input key={i} type="text" value={v}
            onChange={e => i === 0 ? setNtp1(e.target.value) : setNtp2(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '.4rem',
                     fontFamily: 'monospace', fontSize: '.88rem',
                     border: '1px solid #bbb', padding: '.3rem .4rem',
                     boxSizing: 'border-box' }}
          />
        ))}
        <button className="btn btn-primary" onClick={saveNtp} style={{ marginTop: '.1rem' }}>
          {ntpSaved ? t('common.applied') : t('common.apply')}
        </button>
      </div>
    </>
  )
}

// ── SecurityConfig ────────────────────────────────────────────────────────────

function SecurityConfig({ apiFetch }) {
  const { t } = useI18n()

  const FIELDS = [
    { key: 'login_max_attempts',   labelKey: 'system.max_attempts',   min: 1,  max: 100,  unitKey: 'system.unit_attempts' },
    { key: 'login_window_minutes', labelKey: 'system.lockout_window', min: 1,  max: 1440, unitKey: 'system.unit_minutes' },
    { key: 'password_min_length',  labelKey: 'system.min_pw_length',  min: 8,  max: 128,  unitKey: 'system.unit_chars' },
  ]

  const [vals,    setVals]    = useState({})
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/config').then(r => r.json()).then(d => {
      setVals({
        login_max_attempts:   d.login_max_attempts   ?? '10',
        login_window_minutes: d.login_window_minutes ?? '15',
        password_min_length:  d.password_min_length  ?? '12',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [apiFetch])

  const save = async () => {
    await Promise.all(
      FIELDS.map(({ key }) =>
        apiFetch('/api/config', {
          method: 'POST',
          body:   JSON.stringify({ key, value: String(vals[key]) }),
        })
      )
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  return (
    <div style={{ borderTop: '1px solid #e8e8e8', marginTop: '1rem', paddingTop: '.85rem' }}>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.6rem' }}>
        {t('system.brute_force')}
      </div>
      {FIELDS.map(({ key, labelKey, min, max, unitKey }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.5rem' }}>
          <label style={{ fontSize: '.85rem', color: '#444', flex: 1 }}>{t(labelKey)}</label>
          <input
            type="number" min={min} max={max} value={vals[key] ?? ''}
            onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
            style={{ width: '5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '.88rem',
                     border: '1px solid #bbb', padding: '.25rem .4rem' }}
          />
          <span style={{ fontSize: '.78rem', color: '#888', minWidth: '5rem' }}>{t(unitKey)}</span>
        </div>
      ))}
      <button className="btn btn-primary" onClick={save} style={{ marginTop: '.25rem' }}>
        {saved ? t('common.saved') : t('common.save')}
      </button>
    </div>
  )
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ ok, message, onDismiss }) {
  const { t } = useI18n()
  if (!message) return null
  const s = ok
    ? { background: '#d4edda', border: '1px solid #b1dfbb', color: '#155724' }
    : { background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24' }
  return (
    <div style={{ ...s, padding: '.5rem .75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>{t('common.close')}</button>
    </div>
  )
}

// ── DiagReport ────────────────────────────────────────────────────────────────

function DiagReport({ apiFetch }) {
  const { t } = useI18n()
  const [report,  setReport]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/system/report')
      const { report: r } = await res.json()
      setReport(r)
    } catch {
      setReport(t('system.report_error'))
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard?.writeText(report).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div>
      <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.75rem' }}>
        {t('system.report_hint')}
        <a href="https://github.com/mickaelmonsieur/OpenSonix/issues" target="_blank" rel="noreferrer">
          {t('system.report_github')}
        </a>
        {t('system.report_hint2')}
      </p>
      <div className="btn-group" style={{ marginBottom: '.75rem' }}>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? t('common.generating') : report ? t('system.report_regen') : t('system.report_generate')}
        </button>
        <button className="btn" onClick={copy} disabled={!report}>
          {copied ? t('system.report_copied') : t('system.report_copy')}
        </button>
      </div>
      {report && (
        <textarea
          readOnly
          value={report}
          rows={24}
          style={{
            width: '100%', fontFamily: 'monospace', fontSize: '.73rem',
            border: '1px solid #bbb', padding: '.5rem', resize: 'vertical',
            background: '#f8f8f8', color: '#222', lineHeight: 1.45,
          }}
        />
      )}
    </div>
  )
}

// ── LangSelector ──────────────────────────────────────────────────────────────

function LangSelector() {
  const { lang, setLang, t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
      <label style={{ fontSize: '.88rem', color: '#444' }}>{t('system.lang_label')}</label>
      <select value={lang} onChange={e => setLang(e.target.value)}
        style={{ fontFamily: 'monospace', fontSize: '.88rem',
                 border: '1px solid #bbb', padding: '.3rem .4rem' }}>
        {LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </div>
  )
}

// ── System page ───────────────────────────────────────────────────────────────

export default function System() {
  const { apiFetch } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [banner, setBanner] = useState(null)
  const [busy,   setBusy]   = useState(false)

  const action = async (endpoint, confirmMsg, successMsg) => {
    if (!confirm(confirmMsg)) return
    setBusy(true)
    setBanner(null)
    try {
      const res = await apiFetch(`/api/system/${endpoint}`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Error ${res.status}`)
      }
      setBanner({ ok: true, message: successMsg })
    } catch (e) {
      setBanner({ ok: false, message: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h2 className="page-title">{t('system.title')}</h2>

      <Banner {...(banner ?? {})} onDismiss={() => setBanner(null)} />

      {/* ── Interface (langue) ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_lang')}</div>
        <div className="card-body">
          <LangSelector />
        </div>
      </div>

      {/* ── Informations système ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_info')}</div>
        <div className="card-body">
          <SystemInfo apiFetch={apiFetch} />
        </div>
      </div>

      {/* ── Rapport de diagnostic ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_report')}</div>
        <div className="card-body">
          <DiagReport apiFetch={apiFetch} />
        </div>
      </div>

      {/* ── Date & heure ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_datetime')}</div>
        <div className="card-body">
          <DateTimeConfig apiFetch={apiFetch} />
        </div>
      </div>

      {/* ── Sécurité ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_security')}</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.75rem' }}>
            {t('system.security_hint')}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/change-password')}>
            {t('system.security_pw_btn')}
          </button>
          <SecurityConfig apiFetch={apiFetch} />
        </div>
      </div>

      {/* ── Redémarrage ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_reboot')}</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.75rem' }}>
            {t('system.reboot_hint')}
          </p>
          <button className="btn" disabled={busy} onClick={() => action(
            'reboot',
            t('system.reboot_confirm'),
            t('system.reboot_success')
          )}>
            {t('system.reboot_btn')}
          </button>
        </div>
      </div>

      {/* ── Remise à zéro ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('system.card_factory')}</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.4rem' }}>
            {t('system.factory_hint')}
          </p>
          <ul style={{ fontSize: '.85rem', color: '#444', paddingLeft: '1.2rem', marginBottom: '.75rem', lineHeight: 1.7 }}>
            <li>{t('system.factory_item1')}</li>
            <li>{t('system.factory_item2')}</li>
            <li>{t('system.factory_item3')} <code style={{ fontFamily: 'monospace', background: '#f0f0f0', padding: '1px 4px' }}>opensonix</code></li>
            <li>{t('system.factory_item4')}</li>
          </ul>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <button className="btn btn-danger" disabled={busy} onClick={() => action(
              'factory-reset',
              t('system.factory_confirm'),
              t('system.factory_success')
            )}>
              {t('system.factory_btn')}
            </button>
            <span style={{ fontSize: '.78rem', color: '#856404' }}>
              {t('system.factory_warning')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
