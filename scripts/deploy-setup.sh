#!/bin/bash
# ─── Nailio Server Setup Script ───
# Run on fresh Ubuntu/Debian server
# Usage: bash scripts/deploy-setup.sh

set -euo pipefail

DOMAIN="urbamstyle.shop"
APP_DIR="/opt/nailio"

echo "═══════════════════════════════════════"
echo "  Nailio — Server Setup"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════"

# ─── System Updates ───
echo "📦 Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ─── Install Docker ───
if ! command -v docker &>/dev/null; then
  echo "🐳 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# ─── Install Docker Compose ───
if ! command -v docker compose &>/dev/null; then
  echo "🐳 Installing Docker Compose plugin..."
  apt-get install -y docker-compose-plugin
fi

# ─── Install Git ───
if ! command -v git &>/dev/null; then
  echo "📦 Installing Git..."
  apt-get install -y git
fi

# ─── Install Node.js (for frontend build) ───
if ! command -v node &>/dev/null; then
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ─── Firewall ───
echo "🔒 Configuring firewall..."
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── Create app directory ───
echo "📁 Setting up application directory..."
mkdir -p "$APP_DIR"

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Clone repo: cd $APP_DIR && git clone <repo-url> ."
echo "  2. Copy .env: cp .env.production .env"
echo "  3. Build frontend: cd frontend && npm ci && npm run build && cd .."
echo "  4. Start: docker compose up -d"
echo "  5. Run migrations: docker compose exec api npx prisma migrate deploy"
echo "  6. Get SSL: docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d $DOMAIN"
echo ""
