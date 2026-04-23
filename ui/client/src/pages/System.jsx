import { useState }     from 'react'
import { useNavigate }  from 'react-router-dom'
import { useAuth }      from '../App.jsx'

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
  const navigate     = useNavigate()
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
