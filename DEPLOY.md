# Deployment (VPS + Caddy)

Target setup: one small VPS (Ubuntu 24.04, ≥1 GB RAM, **IPv4 address**), the Node
service on `localhost:3000` under systemd, and Caddy in front terminating TLS with an
automatic Let's Encrypt certificate. Run **exactly one instance** — conversation state
and message dedup live in a local SQLite file.

The artifacts referenced below are in `deploy/`:

| File | Goes to |
|---|---|
| `deploy/cj-web-service.service` | `/etc/systemd/system/cj-web-service.service` |
| `deploy/Caddyfile` | `/etc/caddy/Caddyfile` |

## 1. Pick a hostname (no domain required)

Meta requires the webhook URL to be HTTPS with a valid certificate. Either free option
works; Caddy handles the certificate automatically in both cases.

- **sslip.io** — zero signup. `A.B.C.D` becomes `A-B-C-D.sslip.io`
  (e.g. `203.0.113.45` → `203-0-113-45.sslip.io`). Tied to the IP.
- **DuckDNS** — free account at duckdns.org, register e.g. `cjtaxi.duckdns.org` and
  point it at the VPS IP. Survives an IP change without touching the Meta dashboard.
  Preferred for the long term.

## 2. Provision the VPS

```bash
# as root on a fresh Ubuntu 24.04 box
apt update && apt upgrade -y

# Node.js 22 LTS (NodeSource) + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable && corepack prepare pnpm@latest --activate

# Caddy (official repo — https://caddyserver.com/docs/install)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# firewall: only SSH + HTTP/HTTPS reachable (keeps :3000 private)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable

# service user
useradd --system --home /opt/cj-web-service --shell /usr/sbin/nologin cjbot
```

## 3. Install the app

```bash
sudo mkdir -p /opt/cj-web-service
sudo chown cjbot:cjbot /opt/cj-web-service
# get the code there (git clone, or rsync from your machine):
sudo -u cjbot git clone <repo-url> /opt/cj-web-service

cd /opt/cj-web-service
sudo -u cjbot pnpm install     # builds better-sqlite3's native binding
sudo -u cjbot pnpm build       # tsc → dist/
```

Create `/opt/cj-web-service/.env` from `.env.example` and fill everything in:

- `WHATSAPP_API_TOKEN` must be a **permanent System User token** (Meta Business
  Settings → System Users), *not* the 24-hour temporary token from the app dashboard.
- Use an absolute `DB_PATH=/opt/cj-web-service/data/cj-web-service.sqlite` (the
  systemd unit only grants write access to that directory).
- `chmod 600 .env && chown cjbot:cjbot .env` — it holds the API token and app secret.

## 4. Wire up systemd and Caddy

```bash
sudo cp deploy/cj-web-service.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cj-web-service
journalctl -u cj-web-service -f        # watch it boot; config errors abort startup

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# edit the hostname in /etc/caddy/Caddyfile first, then:
sudo systemctl reload caddy
```

Smoke-test the webhook handshake end to end (TLS + proxy + app):

```bash
curl -i "https://<hostname>/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=12345"
# expect: 200 with body "12345"
```

## 5. Point Meta at it

In the Meta App dashboard → WhatsApp → Configuration:

1. Callback URL: `https://<hostname>/webhook`, verify token: your
   `WHATSAPP_VERIFY_TOKEN` → **Verify and save** (this performs the GET handshake).
2. Subscribe to the **`messages`** webhook field.
3. Confirm the `nuevo_pedido` template is **Approved** (see README) — orders cannot be
   delivered without it.

Then send a real WhatsApp message to the bot number and run through the flow once,
confirming the order arrives on `COMPANY_WHATSAPP_NUMBER`.

## Updating

```bash
cd /opt/cj-web-service
sudo -u cjbot git pull
sudo -u cjbot pnpm install
sudo -u cjbot pnpm build
sudo systemctl restart cj-web-service
```

Restarts are safe: Meta retries undelivered webhooks for 7 days and the dedup table
prevents double-processing, so brief downtime delays messages rather than losing them.

## Notes

- **Backups are low-stakes.** The SQLite file only holds in-flight conversations and
  dedup records; losing it means a few users restart their flow, not lost orders.
- **Moving to a real domain later:** change the hostname in `/etc/caddy/Caddyfile`,
  reload Caddy, update the callback URL in the Meta dashboard (same verify token).
  Nothing in the app changes.
- **Disk growth:** `processed_messages` grows one row per inbound message. At taxi-
  company volume this is megabytes per year — ignore it for now.
