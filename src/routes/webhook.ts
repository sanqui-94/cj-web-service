import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import type { Config } from "../config.js";
import type { Router } from "../router.js";

interface VerifyQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

export function verifySignature(rawPayload: string | Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawPayload).digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function registerWebhookRoutes(app: FastifyInstance, config: Config, router: Router): Promise<void> {
  await app.register(rawBody, { field: "rawBody", global: false, runFirst: true });

  app.get<{ Querystring: VerifyQuery }>("/webhook", async (req, reply) => {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    if (mode === "subscribe" && token === config.whatsapp.verifyToken && challenge) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send();
  });

  app.post("/webhook", { config: { rawBody: true } }, async (req, reply) => {
    const signature = req.headers["x-hub-signature-256"];
    if (
      !req.rawBody ||
      !verifySignature(req.rawBody, typeof signature === "string" ? signature : undefined, config.whatsapp.appSecret)
    ) {
      return reply.code(401).send();
    }

    // Acknowledge immediately; Meta retries on slow responses. Processing happens async.
    const payload = req.body;
    setImmediate(() => {
      router.handlePayload(payload).catch((err) => app.log.error(err, "webhook processing failed"));
    });

    return reply.code(200).send();
  });
}
