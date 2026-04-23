import { useState, useEffect, useCallback } from 'react'
import { useAuth }                          from '../App.jsx'
import { useI18n }                          from '../i18n/index.jsx'

const VOLUMES = Array.from({ length: 21 }, (_, i) => i * 5)

const BITRATES = [
  { value: '32000',  label: '32 kbps' },
  { value: '64000',  label: '64 kbps' },
  { value: '96000',  label: '96 kbps' },
  { value: '128000', label: '128 kbps' },
  { value: '192000', label: '192 kbps' },
  { value: '256000', label: '256 kbps' },
]

function DeviceSelect({ value, options, onChange, placeholder }) {
  const list = options.includes(value) ? options : [value, ...options].filter(Boolean)
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {list.length === 0
        ? <option value="">{placeholder}</option>
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

function CredField({ label, value, copyLabel, copiedLabel }) {
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
      <button className="btn" style={{ padding: '2px 8px', fontSize: '.78rem', marginLeft: '.4rem' }} onClick={copy} title={copyLabel}>
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}

export default function Config() {
  const { apiFetch } = useAuth()
  const { t } = useI18n()

  const [original, setOriginal] = useState(null)
  const [form,     setForm]     = useState(null)
  const [devices,  setDevices]  = useState({ playback: [], capture: [] })

  const [sipOrig,  setSipOrig]  = useState(null)
  const [sipForm,  setSipForm]  = useState({ registrar: '', remote_user: '', remote_password: '' })

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
      .catch(() => setBanner({ ok: false, message: t('config.load_error') }))
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
    if (!hasChanges) { setBanner({ ok: true, message: t('config.no_change') }); return }
    setSaving(true)
    setBanner(null)
    try {
      for (const key of changedConfigKeys) {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          body:   JSON.stringify({ key, value: form[key] }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Error on "${key}" (${res.status})`)
        }
      }
      setOriginal({ ...form })

      if (sipChanged) {
        const res = await apiFetch('/api/config/sip', {
          method: 'POST',
          body:   JSON.stringify(sipForm),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Link error (${res.status})`)
        }
        setSipOrig({ ...sipForm })
      }

      setBanner({ ok: true, message: t('config.saved_ok') })
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
    if (!confirm(t('config.rotate_confirm'))) return
    setRotating(true)
    setBanner(null)
    try {
      const res  = await apiFetch('/api/config/sip/rotate', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setSipCreds({ username: body.username, password: body.password })
      setBanner({ ok: true, message: t('config.rotated_ok') })
    } catch (e) {
      setBanner({ ok: false, message: e.message })
    } finally {
      setRotating(false)
    }
  }

  if (!form) {
    return (
      <div className="page">
        <h2 className="page-title">{t('config.title')}</h2>
        {banner ? <Banner {...banner} onDismiss={() => setBanner(null)} /> : <p>{t('common.loading')}</p>}
      </div>
    )
  }

  const nChanged = changedConfigKeys.length + (sipChanged ? 1 : 0)

  return (
    <div className="page">
      <h2 className="page-title">{t('config.title')}</h2>

      <Banner {...(banner ?? {})} onDismiss={() => setBanner(null)} />

      {/* ── Mode ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('config.card_mode')}</div>
        <div className="card-body">
          <div className="form-row">
            <label>{t('config.mode_label')}</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {[['RECEIVER', t('config.receiver')], ['SENDER', t('config.sender')]].map(([val, label]) => (
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
                {t('config.sender_hint')}
              </p>
              <div className="form-row">
                <label>{t('config.remote_ip')}</label>
                <input type="text" value={sipForm.registrar}
                  onChange={e => setS('registrar', e.target.value)}
                  placeholder="10.0.1.11" style={{ width: 200 }} />
              </div>
              <div className="form-row">
                <label>{t('config.remote_login')}</label>
                <input type="text" value={sipForm.remote_user}
                  onChange={e => setS('remote_user', e.target.value)}
                  placeholder="a1b2c3d4…" style={{ width: 260, fontFamily: 'monospace' }} />
              </div>
              <div className="form-row">
                <label>{t('config.remote_password')}</label>
                <input type="text" value={sipForm.remote_password}
                  onChange={e => setS('remote_password', e.target.value)}
                  placeholder="e5f6…" style={{ width: 260, fontFamily: 'monospace' }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Credentials (receiver only) ─────────────────────────────── */}
      {form.mode === 'RECEIVER' && (
        <div className="card">
          <div className="card-header">{t('config.card_credentials')}</div>
          <div className="card-body">
            <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.75rem' }}>
              {t('config.credentials_hint')}
            </p>
            <CredField label={t('config.local_ip')} value={localIp ?? '…'}
              copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
            <CredField label={t('config.login')}    value={sipCreds.username}
              copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
            <CredField label={t('config.password')} value={sipCreds.password}
              copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
            <div style={{ marginTop: '.75rem' }}>
              <button className="btn btn-danger" onClick={rotate} disabled={rotating}
                style={{ fontSize: '.82rem' }}>
                {rotating ? t('config.rotating') : t('config.rotate_btn')}
              </button>
              <span style={{ fontSize: '.78rem', color: '#856404', marginLeft: '.75rem' }}>
                {t('config.rotate_warning')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Transport ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('config.card_transport')}</div>
        <div className="card-body">
          <div className="form-row">
            <label>{t('config.port')}</label>
            <input type="number" min="1024" max="65535"
              value={form.sip_port}
              onChange={e => setF('sip_port', e.target.value)}
              style={{ width: 100 }} />
          </div>
        </div>
      </div>

      {/* ── Audio ────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('config.card_audio')}</div>
        <div className="card-body">
          <div className="form-row">
            <label>{t('config.input_device')}</label>
            <DeviceSelect value={form.audio_device_in} options={devices.capture}
              onChange={v => setF('audio_device_in', v)} placeholder={t('config.no_device')} />
          </div>
          <div className="form-row">
            <label>{t('config.output_device')}</label>
            <DeviceSelect value={form.audio_device_out} options={devices.playback}
              onChange={v => setF('audio_device_out', v)} placeholder={t('config.no_device')} />
          </div>
          <div className="form-row">
            <label>{t('config.capture_volume')}</label>
            <select value={form.capture_volume} onChange={e => setF('capture_volume', e.target.value)}>
              {VOLUMES.map(v => <option key={v} value={String(v)}>{v} %</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>{t('config.playback_volume')}</label>
            <select value={form.playback_volume} onChange={e => setF('playback_volume', e.target.value)}>
              {VOLUMES.map(v => <option key={v} value={String(v)}>{v} %</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Codec OPUS ───────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">{t('config.card_codec')}</div>
        <div className="card-body">
          <div className="form-row">
            <label>{t('config.bitrate')}</label>
            <select value={form.opus_bitrate} onChange={e => setF('opus_bitrate', e.target.value)}>
              {BITRATES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>{t('config.stereo')}</label>
            <input type="checkbox"
              checked={form.opus_stereo === 'true'}
              onChange={e => setF('opus_stereo', e.target.checked ? 'true' : 'false')}
              style={{ width: 'auto', accentColor: '#1c3557' }} />
          </div>
          <div className="form-row">
            <label>{t('config.fec')}</label>
            <input type="checkbox"
              checked={form.opus_fec === 'true'}
              onChange={e => setF('opus_fec', e.target.checked ? 'true' : 'false')}
              style={{ width: 'auto', accentColor: '#1c3557' }} />
          </div>
        </div>
      </div>

      <div className="btn-group">
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving
            ? t('config.saving_btn')
            : hasChanges ? t('config.save_btn_n', { n: nChanged }) : t('config.save_btn')}
        </button>
        <button className="btn" disabled={saving || !hasChanges} onClick={cancel}>
          {t('config.cancel_btn')}
        </button>
      </div>
    </div>
  )
}
