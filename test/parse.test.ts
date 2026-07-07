import { describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../src/whatsapp/parse.js";

function envelope(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "123", changes: [{ value: { messaging_product: "whatsapp", ...value }, field: "messages" }] }],
  };
}

const contact = { profile: { name: "Juan Pérez" }, wa_id: "59171234567" };

describe("parseWebhookPayload", () => {
  it("parses a text message", () => {
    const payload = envelope({
      contacts: [contact],
      messages: [
        { from: "59171234567", id: "wamid.abc", timestamp: "1751800000", type: "text", text: { body: "hola" } },
      ],
    });

    expect(parseWebhookPayload(payload)).toEqual([
      {
        wamid: "wamid.abc",
        from: "59171234567",
        profileName: "Juan Pérez",
        event: { type: "text", text: "hola" },
      },
    ]);
  });

  it("parses an interactive button reply", () => {
    const payload = envelope({
      contacts: [contact],
      messages: [
        {
          from: "59171234567",
          id: "wamid.def",
          timestamp: "1751800001",
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "confirmar", title: "Confirmar" } },
        },
      ],
    });

    expect(parseWebhookPayload(payload)[0]?.event).toEqual({ type: "button", id: "confirmar" });
  });

  it("maps any other message type to unsupported", () => {
    const payload = envelope({
      contacts: [contact],
      messages: [
        { from: "59171234567", id: "wamid.img", timestamp: "1751800002", type: "image", image: { id: "media1" } },
      ],
    });

    expect(parseWebhookPayload(payload)[0]?.event).toEqual({ type: "unsupported" });
  });

  it("ignores status-update notifications (no messages array)", () => {
    const payload = envelope({
      statuses: [{ id: "wamid.abc", status: "delivered", recipient_id: "59171234567" }],
    });

    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it("falls back to the wa_id as profile name when contacts are missing", () => {
    const payload = envelope({
      messages: [
        { from: "59171234567", id: "wamid.abc", timestamp: "1751800000", type: "text", text: { body: "hola" } },
      ],
    });

    expect(parseWebhookPayload(payload)[0]?.profileName).toBe("59171234567");
  });
});
