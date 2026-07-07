import type { InboundEvent } from "../core/machine.js";

export interface InboundMessage {
  wamid: string;
  from: string;
  profileName: string;
  event: InboundEvent;
}

interface RawContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface RawMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
  };
}

interface RawPayload {
  entry?: {
    changes?: {
      value?: {
        contacts?: RawContact[];
        messages?: RawMessage[];
      };
    }[];
  }[];
}

export function parseWebhookPayload(payload: unknown): InboundMessage[] {
  const result: InboundMessage[] = [];
  const entries = (payload as RawPayload).entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      const nameByWaId = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) nameByWaId.set(contact.wa_id, contact.profile.name);
      }

      for (const message of value.messages) {
        if (!message.id || !message.from) continue;
        result.push({
          wamid: message.id,
          from: message.from,
          profileName: nameByWaId.get(message.from) ?? message.from,
          event: toEvent(message),
        });
      }
    }
  }

  return result;
}

function toEvent(message: RawMessage): InboundEvent {
  if (message.type === "text" && typeof message.text?.body === "string") {
    return { type: "text", text: message.text.body };
  }
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    const id = message.interactive.button_reply?.id;
    if (id) return { type: "button", id };
  }
  return { type: "unsupported" };
}
