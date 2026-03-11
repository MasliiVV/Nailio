#!/bin/bash
# ─────────────────────────────────────────────
# Nailio — Telegram Bot Webhook Setup
# Run on server: bash /opt/nailio/scripts/setup-webhook.sh
# ─────────────────────────────────────────────
set -euo pipefail

DOMAIN="urbamstyle.shop"
BOT_TOKEN="8672054054:AAFMGnhtED8jfPS-f86SNsYaSUYMRQvVVns"

echo "🤖 Setting up Telegram bot webhook..."

# 1. Get bot info
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "${BOT_INFO}" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
BOT_ID=$(echo "${BOT_INFO}" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

echo "  Bot: @${BOT_USERNAME} (ID: ${BOT_ID})"

# 2. Register the bot in Nailio API
echo "  Registering bot via API..."

# Generate webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

# 3. Set Telegram webhook
WEBHOOK_URL="https://${DOMAIN}/webhook/${BOT_ID}"
echo "  Setting webhook to: ${WEBHOOK_URL}"

RESULT=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\",\"inline_query\",\"my_chat_member\"]" \
  -d "drop_pending_updates=true")

echo "  Telegram response: ${RESULT}"

# 4. Verify
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")
echo ""
echo "  Webhook info: ${WEBHOOK_INFO}"

# 5. Set Mini App menu button
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"💅 Відкрити\",\"web_app\":{\"url\":\"https://${DOMAIN}\"}}}" > /dev/null

echo ""
echo "🎉 Bot webhook setup complete!"
echo "   Webhook: ${WEBHOOK_URL}"
echo "   Secret:  ${WEBHOOK_SECRET}"
echo ""
echo "⚠️  Save the webhook secret! You may need to add it to your .env file."
