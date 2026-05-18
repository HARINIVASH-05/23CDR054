import { useEffect, useState } from 'react'

export default function Notifications({ apiBase = '', token = '', userId = '' }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined

    fetch(`${apiBase}/api/notifications`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setNotes(data.notifications ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiBase, token])

  // WebSocket for live updates
  useEffect(() => {
    const wsBase = apiBase ? apiBase.replace(/^http/, 'ws') : 'ws://localhost:3000'
    const wsUrl = `${wsBase}/ws${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
    let ws
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      console.warn('WS connection failed', e)
      return
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'notification' && msg.payload) {
          setNotes((cur) => [msg.payload, ...cur])
        }
      } catch (e) {
        // ignore
      }
    }
    ws.onopen = () => console.log('WS open', wsUrl)
    ws.onerror = (e) => console.warn('WS error', e)
    return () => {
      try {
        ws.close()
      } catch (e) {}
    }
  }, [apiBase, userId])

  if (loading) return <p>Loading notifications…</p>
  if (error) return <p className="error">{error}</p>
  if (notes.length === 0) return <p>No notifications</p>

  return (
    <ul className="notifications">
      {notes.map((n) => (
        <li key={n.ID}>
          <strong>{n.Type}</strong>: {n.Message} <em>({n.Timestamp})</em>
        </li>
      ))}
    </ul>
  )
}
