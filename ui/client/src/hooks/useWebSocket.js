import { useState, useEffect, useRef } from 'react'

const RECONNECT_DELAY = 3000

// Maintains a WebSocket connection to /ws?token=<jwt>.
// Returns { wsConnected, call, registration, baresipConnected, audioLevel }.
// Values start as null/false/default and are updated as WS events arrive.
// The consumer is responsible for seeding initial values from the REST API.
export function useWebSocket(token) {
  const [wsConnected,      setWsConnected]      = useState(false)
  const [call,             setCall]             = useState(null)
  const [registration,     setRegistration]     = useState(null)
  const [baresipConnected, setBaresipConnected] = useState(null)
  const [audioLevel,       setAudioLevel]       = useState({ tx: 0, rx: 0 })

  const timerRef = useRef(null)
  const wsRef    = useRef(null)

  useEffect(() => {
    if (!token) return

    let active = true

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws    = new WebSocket(`${proto}//${location.host}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => { if (active) setWsConnected(true) }

      ws.onmessage = ({ data }) => {
        if (!active) return
        let msg
        try { msg = JSON.parse(data) } catch { return }

        const { type, data: d } = msg
        switch (type) {
          case 'call:incoming':
            setCall({ status: 'incoming',    uri: d.uri })
            break
          case 'call:ringing':
            setCall(prev => prev ? { ...prev, status: 'ringing' } : prev)
            break
          case 'call:established':
            setCall({ status: 'established', uri: d.uri })
            break
          case 'call:closed':
            setCall(null)
            setAudioLevel({ tx: 0, rx: 0 })
            break
          case 'reg:ok':
            setRegistration('ok')
            break
          case 'reg:fail':
            setRegistration('fail')
            break
          case 'baresip:connected':
            setBaresipConnected(true)
            break
          case 'baresip:lost':
            setBaresipConnected(false)
            break
          case 'audio:level':
            setAudioLevel(d)
            break
        }
      }

      ws.onerror = () => ws.close()

      ws.onclose = () => {
        if (!active) return
        setWsConnected(false)
        timerRef.current = setTimeout(connect, RECONNECT_DELAY)
      }
    }

    connect()

    return () => {
      active = false
      clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [token])

  return { wsConnected, call, registration, baresipConnected, audioLevel }
}
