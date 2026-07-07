import { describe, expect, it } from "vitest";
import { transition, type Conversation, type InboundEvent } from "../src/core/machine.js";

const NOW = Date.parse("2026-07-06T15:00:00Z");
const TIMEOUT_MS = 30 * 60 * 1000;

function ctx(overrides: Partial<{ now: number; profileName: string; waId: string }> = {}) {
  return {
    now: NOW,
    timeoutMs: TIMEOUT_MS,
    profileName: "Juan Pérez",
    waId: "59171234567",
    ...overrides,
  };
}

function text(t: string): InboundEvent {
  return { type: "text", text: t };
}

function conv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    waId: "59171234567",
    profileName: "Juan Pérez",
    state: "AWAITING_ORIGEN",
    lastActivity: NOW - 60_000,
    ...overrides,
  };
}

describe("conversation start", () => {
  it("greets and asks for origen on the first message", () => {
    const { conversation, actions } = transition(undefined, text("hola"), ctx());

    expect(conversation?.state).toBe("AWAITING_ORIGEN");
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("reply_text");
    if (actions[0]?.type === "reply_text") {
      expect(actions[0].text).toContain("Juan Pérez");
      expect(actions[0].text.toLowerCase()).toContain("recogemos");
    }
  });
});

describe("field collection", () => {
  it("stores origen and asks for destino", () => {
    const { conversation, actions } = transition(conv(), text("Av. América #123, zona Cala Cala"), ctx());

    expect(conversation?.state).toBe("AWAITING_DESTINO");
    expect(conversation?.origen).toBe("Av. América #123, zona Cala Cala");
    expect(actions[0]?.type).toBe("reply_text");
    if (actions[0]?.type === "reply_text") {
      expect(actions[0].text.toLowerCase()).toContain("llevamos");
    }
  });

  it("stores destino and asks for referencia with an Omitir button", () => {
    const { conversation, actions } = transition(
      conv({ state: "AWAITING_DESTINO", origen: "Av. América #123" }),
      text("Aeropuerto"),
      ctx(),
    );

    expect(conversation?.state).toBe("AWAITING_REFERENCIA");
    expect(conversation?.destino).toBe("Aeropuerto");
    expect(actions[0]?.type).toBe("reply_buttons");
    if (actions[0]?.type === "reply_buttons") {
      expect(actions[0].buttons).toEqual([{ id: "omitir", title: "Omitir" }]);
    }
  });

  it("stores referencia and shows the summary with Confirmar/Cancelar buttons", () => {
    const { conversation, actions } = transition(
      conv({ state: "AWAITING_REFERENCIA", origen: "Av. América #123", destino: "Aeropuerto" }),
      text("portón negro"),
      ctx(),
    );

    expect(conversation?.state).toBe("AWAITING_CONFIRM");
    expect(conversation?.referencia).toBe("portón negro");
    expect(actions[0]?.type).toBe("reply_buttons");
    if (actions[0]?.type === "reply_buttons") {
      expect(actions[0].text).toContain("Av. América #123");
      expect(actions[0].text).toContain("Aeropuerto");
      expect(actions[0].text).toContain("portón negro");
      expect(actions[0].text).toContain("Juan Pérez");
      expect(actions[0].buttons).toEqual([
        { id: "confirmar", title: "Confirmar" },
        { id: "cancelar", title: "Cancelar" },
      ]);
    }
  });

  it("skips referencia when the Omitir button is tapped", () => {
    const { conversation, actions } = transition(
      conv({ state: "AWAITING_REFERENCIA", origen: "Av. América #123", destino: "Aeropuerto" }),
      { type: "button", id: "omitir" },
      ctx(),
    );

    expect(conversation?.state).toBe("AWAITING_CONFIRM");
    expect(conversation?.referencia).toBeUndefined();
    expect(actions[0]?.type).toBe("reply_buttons");
    if (actions[0]?.type === "reply_buttons") {
      expect(actions[0].text).not.toContain("Referencia");
    }
  });
});

describe("confirmation", () => {
  const readyToConfirm = () =>
    conv({
      state: "AWAITING_CONFIRM",
      origen: "Av. América #123",
      destino: "Aeropuerto",
      referencia: "portón negro",
    });

  it("Confirmar forwards the order and ends the conversation", () => {
    const { conversation, actions } = transition(readyToConfirm(), { type: "button", id: "confirmar" }, ctx());

    expect(conversation).toBeNull();
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      type: "forward_order",
      order: {
        nombre: "Juan Pérez",
        telefono: "59171234567",
        origen: "Av. América #123",
        destino: "Aeropuerto",
        referencia: "portón negro",
      },
    });
    expect(actions[1]?.type).toBe("reply_text");
    if (actions[1]?.type === "reply_text") {
      expect(actions[1].text.toLowerCase()).toContain("enviado");
    }
  });

  it("Cancelar ends the conversation without forwarding", () => {
    const { conversation, actions } = transition(readyToConfirm(), { type: "button", id: "cancelar" }, ctx());

    expect(conversation).toBeNull();
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("reply_text");
    if (actions[0]?.type === "reply_text") {
      expect(actions[0].text.toLowerCase()).toContain("cancelado");
    }
  });

  it("free text while awaiting confirmation re-shows the summary buttons", () => {
    const { conversation, actions } = transition(readyToConfirm(), text("si porfa"), ctx());

    expect(conversation?.state).toBe("AWAITING_CONFIRM");
    expect(actions[0]?.type).toBe("reply_buttons");
  });
});

describe("cancelar keyword", () => {
  it.each(["cancelar", "CANCELAR", "Cancelár", "  cancelar  "])(
    "aborts mid-flow when the user types %j",
    (word) => {
      const { conversation, actions } = transition(conv({ state: "AWAITING_DESTINO", origen: "X" }), text(word), ctx());

      expect(conversation).toBeNull();
      expect(actions[0]?.type).toBe("reply_text");
      if (actions[0]?.type === "reply_text") {
        expect(actions[0].text.toLowerCase()).toContain("cancelado");
      }
    },
  );

  it("does not treat a sentence containing cancelar as a cancellation", () => {
    const { conversation } = transition(conv(), text("calle cancelaria #5"), ctx());
    expect(conversation?.state).toBe("AWAITING_DESTINO");
  });
});

describe("lazy expiry", () => {
  it("discards a stale conversation and starts fresh", () => {
    const stale = conv({
      state: "AWAITING_DESTINO",
      origen: "Av. América #123",
      lastActivity: NOW - TIMEOUT_MS - 1,
    });
    const { conversation, actions } = transition(stale, text("Aeropuerto"), ctx());

    expect(conversation?.state).toBe("AWAITING_ORIGEN");
    expect(conversation?.origen).toBeUndefined();
    expect(actions[0]?.type).toBe("reply_text");
    if (actions[0]?.type === "reply_text") {
      expect(actions[0].text.toLowerCase()).toContain("recogemos");
    }
  });

  it("keeps a conversation that is under the timeout", () => {
    const fresh = conv({ state: "AWAITING_DESTINO", origen: "X", lastActivity: NOW - TIMEOUT_MS + 1000 });
    const { conversation } = transition(fresh, text("Aeropuerto"), ctx());
    expect(conversation?.state).toBe("AWAITING_REFERENCIA");
  });
});

describe("unsupported message types", () => {
  it("re-asks the pending question when an unsupported message arrives", () => {
    const { conversation, actions } = transition(
      conv({ state: "AWAITING_DESTINO", origen: "X" }),
      { type: "unsupported" },
      ctx(),
    );

    expect(conversation?.state).toBe("AWAITING_DESTINO");
    expect(actions[0]?.type).toBe("reply_text");
    if (actions[0]?.type === "reply_text") {
      expect(actions[0].text.toLowerCase()).toContain("texto");
    }
  });

  it("an unsupported first message still starts the conversation", () => {
    const { conversation, actions } = transition(undefined, { type: "unsupported" }, ctx());
    expect(conversation?.state).toBe("AWAITING_ORIGEN");
    expect(actions).toHaveLength(1);
  });
});
