#!/bin/bash
# ─────────────────────────────────────────────
# Nailio — SSL Setup Script
# Run on server: bash /opt/nailio/scripts/setup-ssl.sh
# ─────────────────────────────────────────────
set -euo pipefail

DOMAIN="urbamstyle.shop"
EMAIL="admin@urbamstyle.shop"
NAILIO_DIR="/opt/nailio"

echo "🔒 Setting up SSL for ${DOMAIN}..."

# 1. Ensure certbot directories exist
mkdir -p "${NAILIO_DIR}/certbot/www"
mkdir -p "${NAILIO_DIR}/certbot/conf"

# 2. Temporarily switch nginx to HTTP-only config for ACME challenge
cat > "${NAILIO_DIR}/nginx/conf.d/default.conf" <<'NGINX_HTTP'
upstream api_backend {
    server api:3000;
}

server {
    listen 80;
    server_name urbamstyle.shop www.urbamstyle.shop _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/auth/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /webhook/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /webhooks/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_HTTP

cd "${NAILIO_DIR}"
docker compose restart nginx
sleep 2

# 3. Obtain certificate
certbot certonly \
  --webroot \
  -w "${NAILIO_DIR}/certbot/www" \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}"

echo "✅ Certificate obtained!"

# 4. Restore full SSL nginx config from git
cd "${NAILIO_DIR}"
git checkout -- nginx/conf.d/default.conf
docker compose restart nginx
sleep 2

# 5. Verify HTTPS
if curl -sfk "https://${DOMAIN}/api/health" > /dev/null 2>&1; then
  echo "✅ HTTPS is working!"
else
  echo "⚠️  HTTPS check failed — verify manually: https://${DOMAIN}/api/health"
fi

# 6. Set up auto-renewal cron
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --deploy-hook 'cd ${NAILIO_DIR} && docker compose restart nginx'") | crontab -
echo "✅ Certbot auto-renewal cron added (daily at 3 AM)"

echo ""
echo "🎉 SSL setup complete for ${DOMAIN}!"
