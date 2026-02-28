# Remote Access via Cloudflare Tunnel

Access Task Planner from anywhere over HTTPS using Cloudflare Tunnel. No port forwarding required.

## How It Works

`cloudflared` runs on your server (Mac Mini) and creates an outbound encrypted connection to Cloudflare's edge network. Cloudflare terminates HTTPS and forwards traffic to your local Express server over HTTP. Your router firewall stays closed.

## Setup

### 1. Install cloudflared

```bash
brew install cloudflared
```

### 2. Generate an API key

```bash
openssl rand -hex 32
```

Copy the output — you'll use this as your `TASK_PLANNER_API_KEY`.

### 3. Configure .env.server

```bash
cp .env.server.example .env.server
```

Edit `.env.server` and set:
- `TASK_PLANNER_API_KEY` — the key you just generated
- `TASK_PLANNER_CORS_ORIGINS` — set after creating the tunnel (see below)

### 4. Start the server

```bash
npm run server:prod
```

This builds the web client and starts the Express server on port 3001.

### 5. Create the tunnel

**Option A: Quick tunnel (no domain needed)**

```bash
cloudflared tunnel --url http://localhost:3001
```

This gives you a random URL like `https://random-words.trycloudflare.com`. The URL changes each time you restart cloudflared.

Set in `.env.server`:
```
TASK_PLANNER_CORS_ORIGINS=*.trycloudflare.com
```

**Option B: Named tunnel (persistent custom domain)**

Requires a domain managed by Cloudflare DNS.

```bash
# Authenticate with Cloudflare
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create taskplanner

# Configure the tunnel (creates ~/.cloudflared/config.yml)
cat > ~/.cloudflared/config.yml << EOF
tunnel: taskplanner
credentials-file: /Users/YOUR_USER/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: tasks.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
EOF

# Add DNS record
cloudflared tunnel route dns taskplanner tasks.yourdomain.com

# Run the tunnel
cloudflared tunnel run taskplanner
```

Set in `.env.server`:
```
TASK_PLANNER_CORS_ORIGINS=https://tasks.yourdomain.com
```

### 6. Access from any device

Open your tunnel URL in a browser:

```
https://your-tunnel-url?apiKey=YOUR_API_KEY
```

The API key is saved to localStorage on first visit — you only need to include it in the URL once per device/browser.

## Security

- **API key auth**: All tRPC requests require a valid `x-api-key` header. The web client handles this automatically after the first `?apiKey=` URL visit.
- **HTTPS**: Cloudflare terminates TLS. All traffic between your device and Cloudflare is encrypted.
- **CORS**: Only origins matching your configured `TASK_PLANNER_CORS_ORIGINS` are allowed.
- **No open ports**: The tunnel is outbound-only. Your router firewall stays closed.

### Optional: Cloudflare Access

For additional security, enable [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) to add a login page (Google, GitHub, email OTP) in front of your tunnel. This is configured in the Cloudflare Zero Trust dashboard — no code changes needed.
