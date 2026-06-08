#!/bin/bash
# =============================================================================
# 7Gather - Let's Encrypt Certificate Initialization Script
# =============================================================================
# Use this script for traditional Nginx deployments (not Nginx Proxy Manager).
# It initializes Let's Encrypt certificates using Certbot in standalone mode.
#
# Prerequisites:
#   - Domain DNS A record pointing to this server's public IP
#   - Port 80 accessible from the internet
#   - certbot installed (apt install certbot)
#
# Usage:
#   chmod +x nginx-certbot-init.sh
#   sudo ./nginx-certbot-init.sh
# =============================================================================

set -euo pipefail

# Load environment variables
if [ -f "../../.env" ]; then
    source "../../.env"
fi

DOMAIN="${DOMAIN:-}"
EMAIL="${CERTBOT_EMAIL:-}"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

if [ -z "$DOMAIN" ]; then
    echo "ERROR: DOMAIN environment variable is not set."
    echo "Set it in .env or export DOMAIN=your.domain.com"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo "ERROR: CERTBOT_EMAIL environment variable is not set."
    echo "Set it in .env or export CERTBOT_EMAIL=admin@your.domain.com"
    exit 1
fi

echo "=== 7Gather SSL Certificate Setup ==="
echo "Domain: ${DOMAIN}"
echo "Email:  ${EMAIL}"
echo ""

# Stop nginx temporarily to free port 80 for standalone verification
echo "Stopping nginx temporarily for certificate verification..."
systemctl stop nginx 2>/dev/null || docker compose stop nginx 2>/dev/null || true

# Request certificate
echo "Requesting Let's Encrypt certificate..."
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    -d "${DOMAIN}" \
    --preferred-challenges http

if [ $? -eq 0 ]; then
    echo ""
    echo "=== Certificate obtained successfully ==="
    echo "Certificate: ${CERT_PATH}/fullchain.pem"
    echo "Private Key: ${CERT_PATH}/privkey.pem"
    echo ""
    echo "Update your .env file:"
    echo "  SSL_CERT_PATH=${CERT_PATH}/fullchain.pem"
    echo "  SSL_KEY_PATH=${CERT_PATH}/privkey.pem"
    echo ""
    echo "Restarting nginx..."
    systemctl start nginx 2>/dev/null || docker compose start nginx 2>/dev/null || true
    echo "Done! Certificate will auto-renew via certbot timer."
else
    echo ""
    echo "=== Certificate request FAILED ==="
    echo "Troubleshooting:"
    echo "  1. Ensure DNS A record for ${DOMAIN} points to this server"
    echo "  2. Ensure port 80 is open in firewall"
    echo "  3. Check certbot logs: /var/log/letsencrypt/letsencrypt.log"
    echo ""
    echo "Restarting nginx..."
    systemctl start nginx 2>/dev/null || docker compose start nginx 2>/dev/null || true
    exit 1
fi
