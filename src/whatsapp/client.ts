import type { Config } from "../config.js";
import type { Button } from "../core/machine.js";

export interface WhatsAppClient {
  sendText(to: string, text: string): Promise<void>;
  sendButtons(to: string, text: string, buttons: Button[]): Promise<void>;
  sendTemplate(to: string, name: string, bodyParams: string[]): Promise<void>;
}

interface ClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_DELAYS_MS = [1000, 5000, 15000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createWhatsAppClient(config: Config, deps: ClientDeps = {}): WhatsAppClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const { graphApiVersion, phoneNumberId, apiToken } = config.whatsapp;
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

  async function post(body: Record<string, unknown>): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) return;

        const detail = await res.text().catch(() => "");
        lastError = new Error(`WhatsApp API responded ${res.status}: ${detail}`);
        // Client errors (except rate limiting) will not succeed on retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw lastError;
      } catch (err) {
        if (err === lastError) throw err;
        lastError = err;
      }
    }

    throw lastError;
  }

  function message(to: string, fields: Record<string, unknown>): Record<string, unknown> {
    return { messaging_product: "whatsapp", recipient_type: "individual", to, ...fields };
  }

  return {
    async sendText(to, text) {
      await post(message(to, { type: "text", text: { body: text } }));
    },

    async sendButtons(to, text, buttons) {
      await post(
        message(to, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text },
            action: {
              buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
            },
          },
        }),
      );
    },

    async sendTemplate(to, name, bodyParams) {
      await post(
        message(to, {
          type: "template",
          template: {
            name,
            language: { code: "es" },
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      );
    },
  };
}
