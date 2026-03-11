#!/bin/bash
# ─────────────────────────────────────────────
# Nailio — Quick Deploy Script
# Run locally: bash scripts/deploy.sh
# ─────────────────────────────────────────────
set -euo pipefail

SERVER="root@173.242.56.147"
REMOTE_DIR="/opt/nailio"

echo "🚀 Deploying Nailio..."

# 1. Push to GitHub
echo "  📤 Pushing to GitHub..."
git push origin master

# 2. Pull on server
echo "  📥 Pulling on server..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && git pull origin master"

# 3. Build frontend
echo "  🏗️  Building frontend..."
ssh "${SERVER}" "cd ${REMOTE_DIR}/frontend && npm run build 2>&1 | tail -3"

# 4. Rebuild & restart API + Worker
echo "  🐳 Rebuilding containers..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && docker compose build api && docker compose up -d --force-recreate api worker nginx 2>&1 | tail -10"

# 5. Run migrations
echo "  🗃️  Running migrations..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && docker compose exec api npx prisma migrate deploy 2>&1 | tail -5"

# 6. Health check
echo "  🏥 Health check..."
sleep 5
HEALTH=$(ssh "${SERVER}" "curl -s http://localhost:3000/api/health")
echo "  ${HEALTH}"

echo ""
echo "🎉 Deploy complete!"
