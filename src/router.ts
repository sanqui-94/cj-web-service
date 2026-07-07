import type { Config } from "./config.js";
import { transition, type Action, type Order } from "./core/machine.js";
import { messages } from "./core/messages.js";
import type { Db } from "./db/index.js";
import type { WhatsAppClient } from "./whatsapp/client.js";
import { parseWebhookPayload } from "./whatsapp/parse.js";

interface Logger {
  error(obj: unknown, msg?: string): void;
}

export interface RouterDeps {
  config: Config;
  db: Db;
  client: WhatsAppClient;
  log: Logger;
  now?: () => number;
}

export interface Router {
  handlePayload(payload: unknown): Promise<void>;
}

/** Template body parameters cannot contain newlines/tabs. */
function sanitizeParam(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "-";
}

export function createRouter({ config, db, client, log, now = Date.now }: RouterDeps): Router {
  const timeoutMs = config.conversationTimeoutMinutes * 60_000;

  async function forwardOrder(order: Order): Promise<void> {
    await client.sendTemplate(config.company.whatsappNumber, config.company.templateName, [
      sanitizeParam(order.nombre),
      sanitizeParam(order.telefono),
      sanitizeParam(order.origen),
      sanitizeParam(order.destino),
      sanitizeParam(order.referencia ?? "-"),
    ]);
  }

  async function execute(waId: string, actions: Action[]): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case "reply_text":
          await client.sendText(waId, action.text);
          break;
        case "reply_buttons":
          await client.sendButtons(waId, action.text, action.buttons);
          break;
        case "forward_order":
          try {
            await forwardOrder(action.order);
          } catch (err) {
            log.error(err, "order delivery to company failed after retries");
            // Skip the remaining actions (the "order sent" confirmation) and be honest instead.
            await client.sendText(waId, messages.deliveryFailed(config.company.phoneDisplay));
            return;
          }
          break;
      }
    }
  }

  return {
    async handlePayload(payload: unknown): Promise<void> {
      for (const inbound of parseWebhookPayload(payload)) {
        try {
          if (!db.markProcessed(inbound.wamid)) continue;

          const current = db.getConversation(inbound.from);
          const { conversation, actions } = transition(current, inbound.event, {
            now: now(),
            timeoutMs,
            profileName: inbound.profileName,
            waId: inbound.from,
          });

          if (conversation) db.saveConversation(conversation);
          else db.deleteConversation(inbound.from);

          await execute(inbound.from, actions);
        } catch (err) {
          log.error(err, `failed to process message ${inbound.wamid}`);
        }
      }
    },
  };
}
