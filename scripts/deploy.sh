#!/bin/bash
# ─────────────────────────────────────────────
# Nailio — Quick Deploy Script
# Run locally: bash scripts/deploy.sh
# ─────────────────────────────────────────────
set -euo pipefail

SERVER="root@173.242.56.147"
REMOTE_DIR="/opt/nailio"
FRONTEND_DIST="/var/www/nailio"

echo "🚀 Deploying Nailio..."

# 1. Push to GitHub
echo "  📤 Pushing to GitHub..."
git push origin master

# 2. Pull on server
echo "  📥 Pulling on server..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && git checkout -- frontend/package.json frontend/package-lock.json && git pull origin master"

# 3. Build frontend
echo "  🏗️  Building frontend..."
ssh "${SERVER}" "cd ${REMOTE_DIR}/frontend && npm install && npm run build 2>&1 | tail -3"

# 4. Copy frontend to host nginx root
echo "  📁 Deploying frontend to ${FRONTEND_DIST}..."
ssh "${SERVER}" "rm -rf ${FRONTEND_DIST}/* && cp -r ${REMOTE_DIR}/frontend/dist/* ${FRONTEND_DIST}/"

# 5. Rebuild & restart API + Worker
echo "  🐳 Rebuilding containers..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && docker compose up -d --build api worker 2>&1 | tail -10"

# 6. Run migrations
echo "  🗃️  Running migrations..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && docker compose exec api npx prisma migrate deploy 2>&1 | tail -5"

# 7. Reload host nginx
echo "  🔄 Reloading nginx..."
ssh "${SERVER}" "systemctl reload nginx"

# 8. Health check
echo "  🏥 Health check..."
sleep 5
HEALTH=$(ssh "${SERVER}" "curl -s https://urbamstyle.shop/health")
echo "  ${HEALTH}"

echo ""
echo "🎉 Deploy complete!"
