import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db/index.js";
import { buildServer } from "../src/server.js";
import type { WhatsAppClient } from "../src/whatsapp/client.js";
import { testConfig } from "./helpers.js";

const WA_ID = "59171234567";
let wamidSeq = 0;

function textMessage(body: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              contacts: [{ profile: { name: "Juan Pérez" }, wa_id: WA_ID }],
              messages: [
                {
                  from: WA_ID,
                  id: `wamid.${++wamidSeq}`,
                  timestamp: "1751800000",
                  type: "text",
                  text: { body },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function buttonMessage(id: string, title: string) {
  const payload = textMessage("");
  const message = payload.entry[0]!.changes[0]!.value.messages[0]! as Record<string, unknown>;
  delete message.text;
  message.type = "interactive";
  message.interactive = { type: "button_reply", button_reply: { id, title } };
  return payload;
}

async function postSigned(app: FastifyInstance, payload: unknown) {
  const body = JSON.stringify(payload);
  return app.inject({
    method: "POST",
    url: "/webhook",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`,
    },
    payload: body,
  });
}

function fakeClient(overrides: Partial<WhatsAppClient> = {}): WhatsAppClient {
  return {
    sendText: vi.fn(async () => {}),
    sendButtons: vi.fn(async () => {}),
    sendTemplate: vi.fn(async () => {}),
    ...overrides,
  };
}

async function makeApp(client: WhatsAppClient) {
  const db = openDb(":memory:");
  const app = await buildServer(testConfig(), { db, whatsapp: client });
  return app;
}

describe("full order flow through the webhook", () => {
  it("collects fields, forwards the template and confirms to the user", async () => {
    const client = fakeClient();
    const app = await makeApp(client);

    let res = await postSigned(app, textMessage("hola"));
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));
    expect(vi.mocked(client.sendText).mock.calls[0]![1]).toContain("Hola Juan Pérez");

    await postSigned(app, textMessage("Av. América #123, Cala Cala"));
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(2));

    await postSigned(app, textMessage("Aeropuerto"));
    await vi.waitFor(() => expect(client.sendButtons).toHaveBeenCalledTimes(1));

    await postSigned(app, textMessage("portón negro"));
    await vi.waitFor(() => expect(client.sendButtons).toHaveBeenCalledTimes(2));

    await postSigned(app, buttonMessage("confirmar", "Confirmar"));
    await vi.waitFor(() => expect(client.sendTemplate).toHaveBeenCalledTimes(1));

    expect(vi.mocked(client.sendTemplate).mock.calls[0]).toEqual([
      "59170000000",
      "nuevo_pedido",
      ["Juan Pérez", WA_ID, "Av. América #123, Cala Cala", "Aeropuerto", "portón negro"],
    ]);
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(3));
    expect(vi.mocked(client.sendText).mock.calls[2]![1].toLowerCase()).toContain("enviado");

    await app.close();
  });

  it("ignores a duplicated wamid (Meta retry)", async () => {
    const client = fakeClient();
    const app = await makeApp(client);

    const payload = textMessage("hola");
    await postSigned(app, payload);
    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(1));

    await postSigned(app, payload);
    await new Promise((r) => setTimeout(r, 20));
    expect(client.sendText).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("tells the user to call when the template delivery fails", async () => {
    const client = fakeClient({
      sendTemplate: vi.fn(async () => {
        throw new Error("WhatsApp API responded 500");
      }),
    });
    const app = await makeApp(client);

    await postSigned(app, textMessage("hola"));
    await postSigned(app, textMessage("Av. América #123"));
    await postSigned(app, textMessage("Aeropuerto"));
    await postSigned(app, buttonMessage("omitir", "Omitir"));
    await vi.waitFor(() => expect(client.sendButtons).toHaveBeenCalledTimes(2));

    await postSigned(app, buttonMessage("confirmar", "Confirmar"));
    await vi.waitFor(() => expect(client.sendTemplate).toHaveBeenCalledTimes(1));

    await vi.waitFor(() => expect(client.sendText).toHaveBeenCalledTimes(3));
    const lastText = vi.mocked(client.sendText).mock.calls[2]![1];
    expect(lastText).toContain("4-4444444");
    expect(lastText.toLowerCase()).not.toContain("enviado");

    await app.close();
  });
});
