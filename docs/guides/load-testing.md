# Load Testing

## k6 smoke scenarios

- Dashboard burst:
  - `k6 run load-tests/dashboard-smoke.js -e BASE_URL=http://127.0.0.1:3001 -e AUTH_TOKEN=...`
- Booking contention on one slot:
  - `k6 run load-tests/booking-contention.js -e BASE_URL=http://127.0.0.1:3001 -e AUTH_TOKEN=... -e SERVICE_ID=... -e SLOT_START=2026-03-25T09:00:00+02:00`

## Minimum acceptance thresholds

- `http_req_failed < 1%` for dashboard reads
- `http_req_failed < 5%` for booking contention scenario
- `p95 < 800ms` for dashboard
- `p95 < 1000ms` for booking create/conflict responses
- zero successful double-bookings for the same slot

## What to watch during the run

- `GET /health/metrics`
- queue counts for `notifications` and `subscriptions`
- Redis memory growth and connected clients
- DB latency in `/health`
- API container CPU / memory
