import { describe, expect, it, vi } from "vitest";
import { createWhatsAppClient } from "../src/whatsapp/client.js";
import { testConfig } from "./helpers.js";

function okResponse() {
  return new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 });
}

function errorResponse(status = 500) {
  return new Response(JSON.stringify({ error: { message: "boom" } }), { status });
}

function makeClient(fetchImpl: typeof fetch) {
  const sleep = vi.fn(async (_ms: number) => {});
  const client = createWhatsAppClient(testConfig(), { fetchImpl, sleep });
  return { client, sleep };
}

describe("sendText", () => {
  it("POSTs a text message to the Graph API with auth", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    const { client } = makeClient(fetchMock);

    await client.sendText("59171234567", "hola");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/111111111111111/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-api-token");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "59171234567",
      type: "text",
      text: { body: "hola" },
    });
  });
});

describe("sendButtons", () => {
  it("POSTs an interactive button message", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    const { client } = makeClient(fetchMock);

    await client.sendButtons("59171234567", "¿Confirmamos?", [
      { id: "confirmar", title: "Confirmar" },
      { id: "cancelar", title: "Cancelar" },
    ]);

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "59171234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "¿Confirmamos?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "confirmar", title: "Confirmar" } },
            { type: "reply", reply: { id: "cancelar", title: "Cancelar" } },
          ],
        },
      },
    });
  });
});

describe("sendTemplate", () => {
  it("POSTs a template message with body parameters", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    const { client } = makeClient(fetchMock);

    await client.sendTemplate("59170000000", "nuevo_pedido", ["Juan", "59171234567", "Origen X", "Destino Y", "-"]);

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "59170000000",
      type: "template",
      template: {
        name: "nuevo_pedido",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Juan" },
              { type: "text", text: "59171234567" },
              { type: "text", text: "Origen X" },
              { type: "text", text: "Destino Y" },
              { type: "text", text: "-" },
            ],
          },
        ],
      },
    });
  });
});

describe("retry ladder", () => {
  it("retries after 1s/5s/15s and succeeds when a later attempt works", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse())
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse());
    const { client, sleep } = makeClient(fetchMock as unknown as typeof fetch);

    await client.sendText("59171234567", "hola");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 5000]);
  });

  it("throws after the initial attempt plus three retries all fail", async () => {
    const fetchMock = vi.fn(async () => errorResponse());
    const { client, sleep } = makeClient(fetchMock);

    await expect(client.sendText("59171234567", "hola")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 5000, 15000]);
  });

  it("does not retry on a 4xx client error", async () => {
    const fetchMock = vi.fn(async () => errorResponse(400));
    const { client } = makeClient(fetchMock);

    await expect(client.sendText("59171234567", "hola")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
