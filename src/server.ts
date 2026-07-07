import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { openDb, type Db } from "./db/index.js";
import { createRouter } from "./router.js";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { createWhatsAppClient, type WhatsAppClient } from "./whatsapp/client.js";

export interface ServerDeps {
  db?: Db;
  whatsapp?: WhatsAppClient;
}

export async function buildServer(config: Config, deps: ServerDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  const db = deps.db ?? openDb(config.dbPath);
  const whatsapp = deps.whatsapp ?? createWhatsAppClient(config);
  const router = createRouter({ config, db, client: whatsapp, log: app.log });

  app.get("/health", async () => ({ status: "ok" }));
  await registerWebhookRoutes(app, config, router);

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}
