const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const http = require('http')
const WebSocket = require('ws')

const app = express()
app.use(cors())
app.use(bodyParser.json())

// In-memory store (prototype only)
const notifications = []

// Simple map of userId => set of websocket clients
const subscriptions = new Map()

app.post('/api/notifications', (req, res) => {
  const { type, title, message, metadata, userId } = req.body
  if (!type || !message) return res.status(400).json({ error: 'type and message required' })
  const note = {
    id: uuidv4(),
    type,
    title: title || null,
    message,
    metadata: metadata || null,
    created_at: new Date().toISOString(),
    targetUser: userId || null,
  }
  notifications.unshift(note)

  // Broadcast to subscribers: if targetUser provided send only to them, else broadcast
  if (note.targetUser) {
    const set = subscriptions.get(note.targetUser)
    if (set) {
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'notification', payload: note }))
      }
    }
  } else {
    // broadcast to all
    for (const set of subscriptions.values()) {
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'notification', payload: note }))
      }
    }
  }

  res.status(201).json({ id: note.id })
})

app.get('/api/notifications', (req, res) => {
  const userId = req.query.userId
  if (userId) {
    // filter notifications that target user or global
    const result = notifications.filter((n) => !n.targetUser || n.targetUser === userId)
    return res.json({ notifications: result.slice(0, 50) })
  }
  res.json({ notifications: notifications.slice(0, 50) })
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/ws' })

wss.on('connection', (socket, req) => {
  // Simple query parse for userId: /ws?userId=abc
  const url = new URL(req.url, `http://${req.headers.host}`)
  const userId = url.searchParams.get('userId') || null
  if (userId) {
    let set = subscriptions.get(userId)
    if (!set) {
      set = new Set()
      subscriptions.set(userId, set)
    }
    set.add(socket)
  }

  socket.on('message', (msg) => {
    // basic ping/pong or subscription messages
    try {
      const data = JSON.parse(msg)
      if (data.action === 'subscribe' && data.userId) {
        let set = subscriptions.get(data.userId)
        if (!set) {
          set = new Set()
          subscriptions.set(data.userId, set)
        }
        set.add(socket)
      }
    } catch (e) {
      // ignore
    }
  })

  socket.on('close', () => {
    // remove socket from all subscription sets
    for (const [userId, set] of subscriptions.entries()) {
      if (set.has(socket)) {
        set.delete(socket)
        if (set.size === 0) subscriptions.delete(userId)
      }
    }
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Notifications prototype listening on ${PORT}`))
