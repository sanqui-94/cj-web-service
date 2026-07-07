# cj-web-service

WhatsApp chatbot for Radio Taxi Ciudad Jardín (Cochabamba, Bolivia). A minimal Node.js web service: it collects a taxi ride request over WhatsApp with a deterministic question-by-question flow (no LLM) and forwards each confirmed order to the company's WhatsApp number via an approved message template.

## How it works

```
Client (WhatsApp) ⇄ Meta Cloud API ⇄ POST /webhook
                                          │ 200 immediately, then async:
                                          ▼
                        dedup (wamid) → state machine → replies
                                          │ on Confirmar
                                          ▼
                        template "nuevo_pedido" → company WhatsApp number
```

Flow: greeting → **origen** → **destino** → **referencia** (optional, `Omitir` button) → summary with `Confirmar`/`Cancelar` buttons. The client's name comes from their WhatsApp profile; their phone number from `wa_id` — neither is asked.

- Typing `cancelar` (any casing/accents) aborts at any point.
- Conversations idle for more than 30 minutes restart on the next message.
- Only text and button replies are understood; anything else re-asks the pending question.
- If the template delivery fails after retries (1s/5s/15s), the user is told to call `COMPANY_PHONE_DISPLAY` instead of receiving a false confirmation.

## Commands

```bash
pnpm install
pnpm dev          # run locally with watch (tsx)
pnpm test         # vitest, full suite
pnpm test:watch
pnpm typecheck
pnpm build        # tsc → dist/
pnpm start        # run built server
```

## Configuration

Copy `.env.example` to `.env`. All variables without a default are required at boot.

| Variable | Purpose |
|---|---|
| `WHATSAPP_API_TOKEN` | Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending phone number ID |
| `WHATSAPP_API_VERSION` | Graph API version (default `v23.0`) |
| `WHATSAPP_VERIFY_TOKEN` | Your webhook verification string |
| `WHATSAPP_APP_SECRET` | App secret for `X-Hub-Signature-256` validation |
| `COMPANY_WHATSAPP_NUMBER` | Number that receives orders (digits, e.g. `59170000000`) |
| `COMPANY_PHONE_DISPLAY` | Phone shown to users when delivery fails |
| `TEMPLATE_NAME` | Approved template name (default `nuevo_pedido`) |
| `DB_PATH` | SQLite file (default `data/cj-web-service.sqlite`) |
| `CONVERSATION_TIMEOUT_MINUTES` | Lazy-expiry window (default `30`) |

## The `nuevo_pedido` template

Must be created in Meta Business Manager (WhatsApp → Message templates) and approved before orders can be delivered. Submit it early — approval can take from minutes to days.

- **Name:** `nuevo_pedido` · **Category:** Utility · **Language:** Spanish (`es`)
- **Body:**

```
🚕 Nuevo pedido de taxi
Cliente: {{1}}
Teléfono: +{{2}}
Origen: {{3}}
Destino: {{4}}
Referencia: {{5}}
```

Sample values for the review: `Juan Pérez` / `59171234567` / `Av. América #123, Cala Cala` / `Aeropuerto` / `portón negro`. When there is no reference the service sends `-`.

## Webhook setup

1. Deploy (any always-on Node host with a persistent disk for `DB_PATH`) or tunnel locally:
   `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
2. In the Meta App dashboard → WhatsApp → Configuration, set the callback URL to `https://<host>/webhook` and the verify token to `WHATSAPP_VERIFY_TOKEN`, then subscribe to the `messages` webhook field.
3. Meta requires a valid TLS certificate (platform/tunnel TLS is fine; self-signed is not).

## Design notes

- `src/core/machine.ts` is a pure function `(conversation, event, ctx) → (conversation, actions)`; all side effects (SQLite, Cloud API) live outside it.
- The webhook always answers `200` once the HMAC signature checks out; processing is async. Meta retries unacknowledged deliveries for 7 days — `processed_messages.wamid` (SQLite UNIQUE) dedups them.
- No LLM, no panel, no queue: orders land on the dispatcher's phone.
