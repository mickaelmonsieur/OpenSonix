import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../App.jsx'
import { useI18n } from '../i18n/index.jsx'

const LIMITS = [10, 25, 50, 100]

function formatDuration(seconds, t) {
  if (!Number.isFinite(seconds)) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts = []
  if (d) parts.push(`${d}${t('dashboard.day')}`)
  if (h || d) parts.push(`${h}${t('dashboard.hour')}`)
  if (m || h || d) parts.push(`${m}${t('dashboard.minute')}`)
  parts.push(`${String(s).padStart(2, '0')}s`)
  return parts.join(' ')
}

function formatDate(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' })
}

function DirectionBadge({ direction }) {
  const { t } = useI18n()
  const inbound = direction === 'inbound'
  return (
    <span className={`badge ${inbound ? 'blue' : 'green'}`}>
      {inbound ? t('history.inbound') : t('history.outbound')}
    </span>
  )
}

export default function History() {
  const { apiFetch } = useAuth()
  const { t, locale } = useI18n()
  const [data, setData]       = useState({ rows: [], page: 1, limit: 25, total: 0, totalPages: 1 })
  const [page, setPage]       = useState(1)
  const [limit, setLimit]     = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/history?page=${page}&limit=${limit}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setData(body)
    } catch {
      setError(t('history.load_error'))
    } finally {
      setLoading(false)
    }
  }, [apiFetch, page, limit, t])

  useEffect(() => { load() }, [load])

  const totalPages = data.totalPages ?? 1
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <main className="page page-wide">
      <h1 className="page-title">{t('history.title')}</h1>

      <div className="card">
        <div className="card-header">{t('history.card_sessions')}</div>
        <div className="card-body">
          <div className="table-toolbar">
            <div className="muted-text">
              {t('history.summary', { total: data.total ?? 0 })}
            </div>
            <div className="table-actions">
              <label>
                {t('history.rows_per_page')}
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1) }}
                >
                  {LIMITS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button className="btn" onClick={load} disabled={loading}>
                {loading ? t('common.loading') : t('history.refresh')}
              </button>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('history.started_at')}</th>
                  <th>{t('history.ended_at')}</th>
                  <th>{t('history.transmission_time')}</th>
                  <th>{t('history.direction')}</th>
                  <th>{t('history.remote')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && data.rows.length === 0 ? (
                  <tr><td colSpan="5" className="empty-cell">{t('common.loading')}</td></tr>
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan="5" className="empty-cell">{t('history.empty')}</td></tr>
                ) : data.rows.map(row => (
                  <tr key={row.id}>
                    <td>{formatDate(row.startedAt, locale)}</td>
                    <td>{formatDate(row.endedAt, locale)}</td>
                    <td className="mono">{formatDuration(row.duration, t)}</td>
                    <td><DirectionBadge direction={row.direction} /></td>
                    <td className="mono remote-cell">{row.remoteUri || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!canPrev || loading}>
              {t('history.previous')}
            </button>
            <span>{t('history.page_of', { page, totalPages })}</span>
            <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={!canNext || loading}>
              {t('history.next')}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
