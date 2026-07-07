# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WhatsApp chatbot for Radio Taxi Ciudad Jardín (Bolivia). Deterministic Q&A (no LLM) collects origen/destino/referencia over WhatsApp; a confirmed order is forwarded to the company's WhatsApp number via the approved `nuevo_pedido` template. No operator panel, no order queue — this service's only output is that template message.

**Stack:** TypeScript (ESM, NodeNext) · Fastify · better-sqlite3 · Vitest · pnpm

## Commands

```bash
pnpm test                      # full suite
pnpm vitest run test/machine.test.ts   # single file
pnpm typecheck                 # tsc --noEmit (includes test/)
pnpm dev                       # tsx watch, needs .env
pnpm build                     # tsc -p tsconfig.build.json → dist/
```

## Architecture

```
routes/webhook.ts   GET verify handshake · POST: HMAC check → 200 → setImmediate
router.ts           parse → dedup(wamid) → load conv → transition() → persist → execute actions
core/machine.ts     PURE state machine: (Conversation|undefined, InboundEvent, ctx) → {conversation, actions}
core/messages.ts    every user-facing Spanish string
whatsapp/parse.ts   webhook payload → typed InboundMessage[] (text | button | unsupported)
whatsapp/client.ts  sendText/sendButtons/sendTemplate + retry ladder (1s/5s/15s)
db/index.ts         SQLite: conversations + processed_messages
```

## Rules that matter

- **`core/machine.ts` stays pure.** No I/O, no Date.now (time comes in via `ctx.now`). All side effects happen in `router.ts`/`client.ts`. Test behavior changes in `test/machine.test.ts` first (this repo was built test-first).
- **The webhook must return 200 fast** once the signature validates — processing is async (`setImmediate` in `routes/webhook.ts`). Never make the handler await sends.
- **Dedup is mandatory:** Meta retries deliveries for 7 days. `db.markProcessed(wamid)` (UNIQUE constraint) must gate every message.
- **Only templates reach the company number.** Free-form sends to `COMPANY_WHATSAPP_NUMBER` will fail outside a 24h window — that's why `forward_order` uses `sendTemplate`. Template body params are sanitized (no newlines) in `router.ts`.
- **Delivery failure must stay honest:** if the template send throws after retries, the user gets the "call us" message and must NOT get the "pedido enviado" confirmation (see `execute()` in `router.ts`).
- **Conversation state lives in SQLite**, keyed by `wa_id`. `conversation: null` from `transition()` means the flow ended → delete the row. Staleness is lazy: checked inside `transition()`, no cron.
- **All user-facing copy** is in `core/messages.ts` — never inline Spanish strings elsewhere.
- Tests inject deps: `buildServer(config, { db, whatsapp })`, `createWhatsAppClient(config, { fetchImpl, sleep })`. Never hit the real Graph API or a real DB file in tests (`openDb(":memory:")`).

## Template

`nuevo_pedido` (Utility, `es`) must exist and be approved in Meta Business Manager; body params order: nombre, teléfono, origen, destino, referencia (`-` when absent). See README for the exact body.
