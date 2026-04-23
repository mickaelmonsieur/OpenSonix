import { useState, useEffect, useCallback } from 'react'
import { useNavigate }                       from 'react-router-dom'
import { useAuth }                           from '../App.jsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(s) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}j`)
  if (h || d) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function fmtMem(bytes) { return `${Math.round(bytes / 1024 / 1024)} Mo` }

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
  const [info, setInfo] = useState(null)

  const load = useCallback(() => {
    apiFetch('/api/system/info').then(r => r.json()).then(setInfo).catch(() => {})
  }, [apiFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  if (!info) return <p style={{ fontSize: '.85rem', color: '#888' }}>Chargement…</p>

  const usedMem = info.memory.total - info.memory.free
  const netLabel = info.network.iface
    ? `${info.network.iface} — ${info.network.state === 'up' ? (info.network.speed ? `${info.network.speed} Mbps` : 'up') : info.network.state}`
    : '—'
  const datetime = info.datetime
    ? new Date(info.datetime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
    : '—'

  const v = info.versions ?? {}

  return (
    <>
      <table style={{ borderCollapse: 'collapse', fontSize: '.88rem', width: '100%', marginBottom: '1rem' }}>
        <tbody>
          <InfoRow label="Uptime"           value={fmtUptime(info.uptime)} />
          <InfoRow label="Charge (1/5/15m)" value={`${fmtLoad(info.load.m1)} / ${fmtLoad(info.load.m5)} / ${fmtLoad(info.load.m15)}`} />
          <InfoRow label="Cœurs CPU"        value={info.cpus} />
          <InfoRow label="Mémoire"          value={`${fmtMem(usedMem)} utilisés / ${fmtMem(info.memory.total)} total`} />
          <InfoRow label="Réseau"           value={netLabel} />
          <InfoRow label="Date / heure"     value={datetime} />
          <InfoRow label="OS"               value={info.osName} />
        </tbody>
      </table>

      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: '.75rem' }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.4rem' }}>Versions logicielles</div>
        <table style={{ borderCollapse: 'collapse', fontSize: '.88rem', width: '100%' }}>
          <tbody>
            <InfoRow label="Firmware"     value={v.firmware} />
            <InfoRow label="Kernel"       value={v.kernel} />
            <InfoRow label="Node.js"      value={v.node} />
            <InfoRow label="Moteur codec" value={v.baresip} />
          </tbody>
        </table>
      </div>
    </>
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

export default function System() {
  const { apiFetch } = useAuth()
  const navigate      = useNavigate()
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
        throw new Error(j.error ?? `Erreur ${res.status}`)
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
      <h2 className="page-title">Système</h2>

      <Banner {...(banner ?? {})} onDismiss={() => setBanner(null)} />

      {/* ── Informations système ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Informations système</div>
        <div className="card-body">
          <SystemInfo apiFetch={apiFetch} />
        </div>
      </div>

      {/* ── Sécurité ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Sécurité</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.75rem' }}>
            Modifiez le mot de passe de connexion à l'interface web.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/change-password')}>
            Changer le mot de passe
          </button>
        </div>
      </div>

      {/* ── Redémarrage ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Redémarrage</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.75rem' }}>
            Redémarre le Raspberry Pi. La liaison audio est interrompue pendant environ 30 secondes.
          </p>
          <button className="btn" disabled={busy} onClick={() => action(
            'reboot',
            'Redémarrer le Raspberry Pi ?\n\nLa liaison sera interrompue.',
            'Redémarrage en cours… reconnectez-vous dans 30 secondes.'
          )}>
            Redémarrer
          </button>
        </div>
      </div>

      {/* ── Remise à zéro ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">Remise à zéro</div>
        <div className="card-body">
          <p style={{ fontSize: '.88rem', color: '#444', marginBottom: '.4rem' }}>
            Remet l'appareil dans son état d'origine :
          </p>
          <ul style={{ fontSize: '.85rem', color: '#444', paddingLeft: '1.2rem', marginBottom: '.75rem', lineHeight: 1.7 }}>
            <li>Configuration audio et codec réinitialisée</li>
            <li>Identifiants de liaison régénérés — toute paire distante devra être reconfigurée</li>
            <li>Mot de passe remis à <code style={{ fontFamily: 'monospace', background: '#f0f0f0', padding: '1px 4px' }}>opensonix</code></li>
            <li>Réseau remis en DHCP</li>
          </ul>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <button className="btn btn-danger" disabled={busy} onClick={() => action(
              'factory-reset',
              'REMISE À ZÉRO COMPLÈTE\n\nToute la configuration sera perdue :\n\n— configuration audio et codec réinitialisée\n— identifiants de liaison régénérés\n— mot de passe remis à "opensonix"\n— réseau remis en DHCP\n\nL\'appareil redémarrera. Confirmer ?',
              'Remise à zéro effectuée. Redémarrage en cours…'
            )}>
              Remise à zéro
            </button>
            <span style={{ fontSize: '.78rem', color: '#856404' }}>
              ⚠ Irréversible — l'appareil redémarre
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
