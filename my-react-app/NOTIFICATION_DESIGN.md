# Campus Notifications Microservice — Design

This document describes a practical design for the Campus Notifications Microservice used to deliver real-time updates about Placements, Events, and Results to students.

## Goals
- Real-time or near-real-time delivery of structured notifications.
- Support multiple delivery channels (web UI via WebSocket/SSE, push notifications, email optionally).
- Secure, auditable, and scalable.

## High-level architecture

- API Gateway / Load Balancer
  - Entry point for external requests. Handles TLS termination, rate limiting, and routing to the notification service.

- Notifications Service (stateless)
  - Exposes REST endpoints for producing notifications and for management.
  - Publishes messages to an internal message broker.

- Message Broker (e.g., Redis Stream, RabbitMQ, Kafka)
  - Durable stream of notification events used to decouple producers from delivery workers.

- Delivery Workers
  - Consume events and perform channel-specific delivery (WebSocket fanout, push via FCM/APNs, email enqueuing).
  - Track delivery state and retries.

- Subscription Store (Redis or database)
  - Keeps track of active WebSocket connections and user subscriptions (channels/topics, preferences).

- Persistent Store (Postgres / DynamoDB)
  - Stores canonical notifications, metadata, and audit logs. Useful for history, search and analytics.

- Monitoring & Observability
  - Prometheus/Grafana for metrics, ELK or Loki for logs, and tracing (Jaeger/OpenTelemetry).

## Data model (example)

- Notification
  - id: UUID
  - type: enum {Placement, Event, Result}
  - title: string
  - message: string
  - metadata: json (freeform extra data)
  - created_at: timestamp
  - valid_from, valid_to: timestamps (optional)

- DeliveryRecord
  - id: UUID
  - notification_id: UUID
  - channel: enum {websocket, push, email}
  - user_id: string
  - status: enum {pending, sent, failed}
  - attempts: int
  - last_error: string
  - last_attempted_at: timestamp

- Subscription
  - user_id: string
  - channels: array
  - preferences: json

## API contract

- POST /api/notifications
  - Purpose: create a new notification
  - Auth: Service-to-service JWT or API key
  - Body: { type, title, message, metadata }
  - Response: 201 { id }

- GET /api/notifications?userId={id}&limit=20
  - Purpose: fetch recent notifications for a user
  - Auth: user token
  - Response: 200 { notifications: [...] }

- WebSocket endpoint: /ws
  - Purpose: real-time delivery for connected clients
  - Auth: cookie or bearer token during handshake
  - Behavior: subscribe to topics (e.g., user:123, global:placements)

- POST /api/subscribe or plain WS message
  - Purpose: manage subscriptions and preferences

## Event flow

1. Producer POSTs to /api/notifications (or internal producer writes to broker).
2. API service validates, stores notification in DB, and publishes an event to the broker.
3. Delivery workers consume the event and:
   - For WebSocket-connected users: look up active connections in Subscription Store and push payload.
   - For mobile push: enqueue to push service (FCM/APNs) and record delivery attempts.
   - For email: enqueue to mailer service.
4. Delivery workers write DeliveryRecord entries and perform retries with exponential backoff for failures.

## Security

- Authentication/Authorization
  - Service endpoints should require mTLS or JWT with scopes for creation of notifications.
  - User-facing endpoints use standard JWT sessions or OAuth tokens.

- Secrets
  - Store keys (FCM, email credentials, client secrets) in a secret manager (Vault, AWS Secrets Manager).

- Audit and Logging
  - All creation and delivery attempts must be logged with user/service id and timestamps.

## Scaling and reliability

- Use a message broker (Kafka/Redis Streams) to decouple bursts from delivery capacity.
- Horizontal scale: make API services stateless, run behind a LB/Ingress.
- Use a persistent consumer group for delivery workers with checkpointing for at-least-once delivery.
- Use rate-limiting for expensive channels (email, push).

## Monitoring

- Metrics: notifications produced/sec, delivered/sec, failed deliveries, retry counts, queue lag.
- Alerts: queue lag > threshold, error rate spike, auth failures.

## Deployment / rollout plan

1. Implement REST create + store + broker publish and simple WebSocket push to local users.
2. Implement Delivery workers with at-least-once semantics and retries.
3. Add persistent storage and history endpoints.
4. Add push/email channels and secrets management.

## Minimal acceptance criteria (Stage 1)

- Able to POST a notification and have it immediately visible to connected web clients.
- A basic history endpoint to GET recent notifications for a user.
- Logging of create events and simple metrics for produced vs delivered.

---
This design is intentionally pragmatic and can be implemented with small incremental steps. If you want, I can scaffold a minimal Node/Express + Redis Streams prototype and wire the frontend to it.
