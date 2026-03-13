# 🐳 Docker & Deployment

> Docker Compose конфігурація. Environment variables. SSL. Production deployment.

---

## Architecture

```
                    ┌──────────────────┐
                    │     Nginx        │
                    │  (reverse proxy) │
                    │  :80 / :443      │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   API    │  │  Admin   │  │ Mini App  │
        │ (NestJS) │  │  (SPA)   │  │  (SPA)   │
        │  :3000   │  │  static  │  │  CDN     │
        └────┬─────┘  └──────────┘  └──────────┘
             │
     ┌───────┼───────┬───────────┐
     │       │       │           │
     ▼       ▼       ▼           ▼
┌────────┐┌──────┐┌───────┐┌────────┐
│PgBouncer││Redis ││Worker ││ MinIO  │
│ :6432  ││:6379 ││(BullMQ)│ :9000  │
└───┬────┘└──────┘└───────┘└────────┘
    │
    ▼
┌────────┐
│PostgreSQL│
│ :5432  │
└────────┘
```

---

## Docker Compose

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ─── API Server ───
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: nailio-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nailio:${DB_PASSWORD}@pgbouncer:6432/nailio
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - BOT_TOKEN_ENCRYPTION_KEY=${BOT_TOKEN_ENCRYPTION_KEY}
      - PAYMENT_ENCRYPTION_KEY=${PAYMENT_ENCRYPTION_KEY}
      - PLATFORM_BOT_TOKEN=${PLATFORM_BOT_TOKEN}
      - MONOBANK_MERCHANT_TOKEN=${MONOBANK_MERCHANT_TOKEN}
      - LIQPAY_PUBLIC_KEY=${LIQPAY_PUBLIC_KEY}
      - LIQPAY_PRIVATE_KEY=${LIQPAY_PRIVATE_KEY}
      - MINIO_ENDPOINT=minio
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - API_BASE_URL=${API_BASE_URL}
      - MINI_APP_URL=${MINI_APP_URL}
      - ADMIN_URL=${ADMIN_URL}
    depends_on:
      pgbouncer:
        condition: service_started
      redis:
        condition: service_healthy
    networks:
      - internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── BullMQ Worker ───
  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: nailio-worker
    restart: unless-stopped
    command: ["node", "dist/worker.js"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nailio:${DB_PASSWORD}@pgbouncer:6432/nailio
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - BOT_TOKEN_ENCRYPTION_KEY=${BOT_TOKEN_ENCRYPTION_KEY}
      - PAYMENT_ENCRYPTION_KEY=${PAYMENT_ENCRYPTION_KEY}
      - PLATFORM_BOT_TOKEN=${PLATFORM_BOT_TOKEN}
      - MONOBANK_MERCHANT_TOKEN=${MONOBANK_MERCHANT_TOKEN}
      - LIQPAY_PUBLIC_KEY=${LIQPAY_PUBLIC_KEY}
      - LIQPAY_PRIVATE_KEY=${LIQPAY_PRIVATE_KEY}
    depends_on:
      - api
    networks:
      - internal

  # ─── PostgreSQL ───
  postgres:
    image: postgres:16-alpine
    container_name: nailio-postgres
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      - POSTGRES_DB=nailio
      - POSTGRES_USER=nailio
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432"   # local access only
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nailio"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── PgBouncer ───
  pgbouncer:
    image: edoburu/pgbouncer:latest
    container_name: nailio-pgbouncer
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://nailio:${DB_PASSWORD}@postgres:5432/nailio
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=200
      - DEFAULT_POOL_SIZE=20
      - MIN_POOL_SIZE=5
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - internal

  # ─── Redis ───
  redis:
    image: redis:7-alpine
    container_name: nailio-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --appendonly yes
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"   # local access only
    networks:
      - internal
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── MinIO (S3-compatible storage) ───
  minio:
    image: minio/minio:latest
    container_name: nailio-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"   # Console
    networks:
      - internal

  # ─── Nginx (reverse proxy + SSL) ───
  nginx:
    image: nginx:alpine
    container_name: nailio-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./admin/dist:/var/www/admin:ro
    depends_on:
      - api
    networks:
      - internal
      - external

  # ─── Certbot (Let's Encrypt) ───
  certbot:
    image: certbot/certbot:latest
    container_name: nailio-certbot
    volumes:
      - ./certbot/www:/var/www/certbot:rw
      - ./certbot/conf:/etc/letsencrypt:rw

volumes:
  postgres_data:
  redis_data:
  minio_data:

networks:
  internal:
    driver: bridge
  external:
    driver: bridge
```

---

## Dockerfile

```dockerfile
# Multi-stage build
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS dependencies
RUN npm ci --omit=dev
RUN npx prisma generate

FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=dependencies /app/prisma ./prisma
COPY package*.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

---

## Nginx Configuration

```nginx
# nginx/conf.d/api.conf

upstream api_backend {
    server api:3000;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_general:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=api_auth:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=api_webhook:10m rate=100r/s;

server {
    listen 80;
    server_name api.nailio.example.com;

    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.nailio.example.com;

    ssl_certificate /etc/letsencrypt/live/api.nailio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nailio.example.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API
    location /api/ {
        limit_req zone=api_general burst=20 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Auth endpoints (stricter rate limit)
    location /api/auth/ {
        limit_req zone=api_auth burst=5 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Webhooks (higher limit, no rate-limit delay)
    location /webhook/ {
        limit_req zone=api_webhook burst=50 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /webhooks/ {
        limit_req zone=api_webhook burst=50 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check (no rate limit)
    location /health {
        proxy_pass http://api_backend;
    }
}

# Admin panel
server {
    listen 443 ssl http2;
    server_name admin.nailio.example.com;

    ssl_certificate /etc/letsencrypt/live/admin.nailio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.nailio.example.com/privkey.pem;

    root /var/www/admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Environment Variables

### Required (.env)

```bash
# ─── Database ───
DB_PASSWORD=strong-random-password-here

# ─── Redis ───
REDIS_PASSWORD=strong-random-password-here

# ─── JWT ───
JWT_SECRET=64-char-hex-random-string

# ─── Encryption Keys ───
BOT_TOKEN_ENCRYPTION_KEY=64-char-hex-for-aes-256
PAYMENT_ENCRYPTION_KEY=64-char-hex-for-aes-256-separate

# ─── Platform Bot ───
PLATFORM_BOT_TOKEN=123456:ABC-DEF...

# ─── Payment: Monobank ───
MONOBANK_MERCHANT_TOKEN=uXxxxx...

# ─── Payment: LiqPay ───
LIQPAY_PUBLIC_KEY=sandbox_xxx...
LIQPAY_PRIVATE_KEY=sandbox_xxx...

# ─── MinIO ───
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=strong-random-password-here

# ─── URLs ───
API_BASE_URL=https://api.nailio.example.com
MINI_APP_URL=https://app.nailio.example.com
ADMIN_URL=https://admin.nailio.example.com
```

### Generating Secrets

```bash
# JWT Secret (256-bit)
openssl rand -hex 32

# AES-256 key (256-bit)
openssl rand -hex 32

# Redis / DB passwords
openssl rand -base64 32
```

---

## SSL Setup (Let's Encrypt)

### Initial Certificate

```bash
# 1. Start nginx with HTTP only (comment out SSL blocks first)
docker compose up -d nginx

# 2. Get certificates
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d api.nailio.example.com \
  -d admin.nailio.example.com \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email

# 3. Enable SSL in nginx config, restart
docker compose restart nginx
```

### Auto-Renewal

```bash
# Cron job (add to host crontab)
0 0 1,15 * * docker compose run --rm certbot renew --quiet && docker compose restart nginx
```

---

## Deployment Flow

### First Deploy

```bash
# 1. Clone repository
git clone git@github.com:user/nailio.git
cd nailio

# 2. Create .env
cp .env.example .env
# Edit .env with production values

# 3. Build and start
docker compose build
docker compose up -d postgres redis
sleep 10

# 4. Run migrations
docker compose run --rm api npx prisma migrate deploy

# 5. Seed admin user
docker compose run --rm api node dist/scripts/seed-admin.js

# 6. Start all services
docker compose up -d

# 7. Setup SSL
# (see SSL section above)

# 8. Set platform bot webhook
curl -X POST "https://api.telegram.org/bot${PLATFORM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.nailio.example.com/webhook/platform", "secret_token": "random-secret"}'

# 9. Verify
curl https://api.nailio.example.com/health
```

### Rolling Update

```bash
# 1. Pull latest code
git pull origin main

# 2. Build new image
docker compose build api worker

# 3. Run migrations (if any)
docker compose run --rm api npx prisma migrate deploy

# 4. Rolling restart
docker compose up -d --no-deps api
sleep 10  # Wait for health check
docker compose up -d --no-deps worker

# 5. Verify
curl https://api.nailio.example.com/health
```

### Rollback

```bash
# 1. Checkout previous version
git checkout HEAD~1

# 2. Rebuild
docker compose build api worker

# 3. Rollback migration (if needed)
docker compose run --rm api npx prisma migrate resolve --rolled-back <migration_name>

# 4. Restart
docker compose up -d --no-deps api worker
```

---

## Monitoring

### Health Check Endpoint

```typescript
@Controller()
export class HealthController {
  @Get('health')
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: await this.checkDb(),
        redis: await this.checkRedis(),
        worker: await this.checkWorker(),
      }
    };
  }
}
```

### Docker Logging

```bash
# View logs
docker compose logs -f api
docker compose logs -f worker --tail=100

# Log rotation (daemon.json)
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

### Recommended Monitoring Stack (Phase 2)

| Tool | Призначення |
|---|---|
| Prometheus | Metrics collection |
| Grafana | Dashboards |
| Loki | Log aggregation |
| Uptime Kuma | Uptime monitoring + alerts |
