# 7Gather - Nginx Reverse Proxy & TLS Configuration

This directory contains Nginx configuration for the 7Gather platform. There are two supported approaches:

1. **Nginx Proxy Manager (Default)** — UI-based configuration via `jc21/nginx-proxy-manager` (used in docker-compose.yml)
2. **Traditional Nginx** — Manual `nginx.conf` template for custom deployments

---

## Option 1: Nginx Proxy Manager (Recommended for Docker Compose)

The default `docker-compose.yml` uses [Nginx Proxy Manager](https://nginxproxymanager.com/) which provides a web UI for managing proxy hosts and SSL certificates.

### Initial Access

After running `docker compose up`, access the admin panel:

```
http://<server-ip>:81
```

Default credentials:
- **Email:** `admin@example.com`
- **Password:** `changeme`

> Change these immediately on first login.

### Configuring Proxy Hosts

You need to create **3 proxy hosts** in the Nginx Proxy Manager UI:

#### 1. Client Web App (Main Domain)

| Field | Value |
|-------|-------|
| Domain Names | `gather.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname/IP | `client` |
| Forward Port | `80` |
| Block Common Exploits | ✅ |
| Websockets Support | ❌ |

#### 2. Colyseus State Server (WebSocket)

| Field | Value |
|-------|-------|
| Domain Names | `ws.gather.yourdomain.com` (or use path-based: `gather.yourdomain.com` with custom location) |
| Scheme | `http` |
| Forward Hostname/IP | `colyseus` |
| Forward Port | `2567` |
| Block Common Exploits | ✅ |
| Websockets Support | ✅ |

**Custom Nginx Configuration** (Advanced tab):

```nginx
# Keep WebSocket connections alive (≥300s timeout)
proxy_read_timeout 300s;
proxy_send_timeout 300s;

# Disable buffering for real-time state sync
proxy_buffering off;
```

#### 3. LiveKit Media Server (WebSocket + WebRTC Signaling)

| Field | Value |
|-------|-------|
| Domain Names | `livekit.gather.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname/IP | `livekit` |
| Forward Port | `7880` |
| Block Common Exploits | ❌ |
| Websockets Support | ✅ |

**Custom Nginx Configuration** (Advanced tab):

```nginx
# Keep WebSocket connections alive for media sessions
proxy_read_timeout 300s;
proxy_send_timeout 300s;

# Disable buffering for real-time media signaling
proxy_buffering off;
```

### Enabling SSL with Let's Encrypt

For each proxy host created above:

1. Click the proxy host → **SSL** tab
2. Select **"Request a new SSL Certificate"**
3. Check **"Force SSL"** (enables automatic HTTP→HTTPS redirect)
4. Check **"HTTP/2 Support"**
5. Enter your email for Let's Encrypt notifications
6. Check **"I Agree to the Let's Encrypt Terms of Service"**
7. Click **Save**

Nginx Proxy Manager handles:
- ✅ Automatic certificate provisioning
- ✅ Automatic certificate renewal (before expiry)
- ✅ HTTP → HTTPS redirect (when "Force SSL" is checked)
- ✅ HSTS headers (optional, via Advanced tab)

### SSL Troubleshooting

If certificate provisioning fails:

1. **DNS not propagated** — Ensure your domain's A record points to the server's public IP. Use `dig yourdomain.com` to verify.
2. **Port 80 blocked** — Let's Encrypt validation requires port 80 accessible from the internet. Check firewall rules.
3. **Rate limited** — Let's Encrypt has rate limits (50 certs/week per domain). Wait and retry.
4. **Check logs** — In Nginx Proxy Manager UI, go to the proxy host and check the error log.

### Single-Domain Setup (Path-Based Routing)

If you prefer using a single domain with path-based routing instead of subdomains:

1. Create one proxy host for `gather.yourdomain.com` → `client:80`
2. In the **Advanced** tab, add custom Nginx configuration:

```nginx
# Colyseus WebSocket (state synchronization)
location /colyseus/ {
    proxy_pass http://colyseus:2567/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
}

# Colyseus HTTP API (health, rooms, tokens)
location /api/ {
    proxy_pass http://colyseus:2567/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# LiveKit WebSocket signaling
location /livekit/ {
    proxy_pass http://livekit:7880/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
}
```

---

## Option 2: Traditional Nginx (Manual Deployment)

Use the `nginx.conf` template in this directory for deployments without Nginx Proxy Manager (e.g., bare-metal, existing Nginx installation).

### Setup Steps

1. **Set environment variables** in `.env`:

```bash
# Required for traditional nginx deployment
DOMAIN=gather.yourdomain.com
SSL_CERT_PATH=/etc/letsencrypt/live/gather.yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/gather.yourdomain.com/privkey.pem
CERTBOT_EMAIL=admin@yourdomain.com
```

2. **Generate nginx.conf from template** using envsubst:

```bash
envsubst '${DOMAIN} ${SSL_CERT_PATH} ${SSL_KEY_PATH}' \
    < config/nginx/nginx.conf \
    > /etc/nginx/nginx.conf
```

3. **Obtain SSL certificate** using the provided script:

```bash
chmod +x config/nginx/nginx-certbot-init.sh
sudo ./config/nginx/nginx-certbot-init.sh
```

Or manually with certbot:

```bash
sudo certbot certonly --standalone -d gather.yourdomain.com --email admin@yourdomain.com --agree-tos
```

4. **Start/reload Nginx:**

```bash
sudo nginx -t          # Test configuration
sudo systemctl reload nginx
```

### Auto-Renewal

Certbot installs a systemd timer that auto-renews certificates. Verify it's active:

```bash
sudo systemctl status certbot.timer
```

To add a post-renewal hook for Nginx reload:

```bash
echo 'systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes (traditional) | — | Primary domain for the platform |
| `SSL_CERT_PATH` | Yes (traditional) | — | Path to SSL certificate (fullchain.pem) |
| `SSL_KEY_PATH` | Yes (traditional) | — | Path to SSL private key (privkey.pem) |
| `CERTBOT_EMAIL` | Yes (traditional) | — | Email for Let's Encrypt notifications |
| `LIVEKIT_URL` | Yes | `ws://localhost:7880` | LiveKit server URL (use `wss://` for production) |
| `LIVEKIT_API_KEY` | Yes | `devkey` | LiveKit API key for token generation |
| `LIVEKIT_API_SECRET` | Yes | `secret` | LiveKit API secret for token signing |
| `LIVEKIT_TURN_DOMAIN` | No | — | Domain for TURN server TLS |

---

## Architecture Notes

### Why WebSocket Timeout ≥300s?

The Colyseus state server maintains persistent WebSocket connections for real-time synchronization. Nginx's default `proxy_read_timeout` (60s) would disconnect idle users. Setting it to 300s (5 minutes) ensures:
- Users who are AFK but still in the room stay connected
- Background state sync continues without interruption
- Meets Requirement 10.5: "maintain persistent connection without inactivity timeout below 300 seconds"

### WebSocket Upgrade Headers

Both Colyseus and LiveKit use WebSocket connections. The proxy must forward:
- `Upgrade: websocket` — Tells the upstream to switch protocols
- `Connection: upgrade` — Signals the connection should be upgraded
- `proxy_http_version 1.1` — Required for WebSocket upgrade (HTTP/1.0 doesn't support it)

### LiveKit UDP Ports

LiveKit uses UDP ports 50000-60000 for WebRTC media transport. These ports are **not** proxied through Nginx — they're exposed directly in docker-compose.yml. Only the signaling port (7880/TCP) goes through the reverse proxy.

### HTTP → HTTPS Redirect

TLS is mandatory for:
- `getUserMedia()` (camera/microphone) requires secure context
- WebRTC requires secure origin in most browsers
- WebSocket `wss://` provides encrypted state synchronization
