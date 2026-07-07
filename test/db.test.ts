import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";

describe("message dedup", () => {
  it("markProcessed returns true the first time a wamid is seen", () => {
    const db = openDb(":memory:");
    expect(db.markProcessed("wamid.HBgLNTk...ABC")).toBe(true);
    db.close();
  });

  it("markProcessed returns false when the same wamid arrives again (Meta retry)", () => {
    const db = openDb(":memory:");
    db.markProcessed("wamid.HBgLNTk...ABC");
    expect(db.markProcessed("wamid.HBgLNTk...ABC")).toBe(false);
    db.close();
  });

  it("different wamids are both processed", () => {
    const db = openDb(":memory:");
    expect(db.markProcessed("wamid.first")).toBe(true);
    expect(db.markProcessed("wamid.second")).toBe(true);
    db.close();
  });
});

describe("conversation persistence", () => {
  it("returns undefined for an unknown waId", () => {
    const db = openDb(":memory:");
    expect(db.getConversation("59171234567")).toBeUndefined();
    db.close();
  });

  it("round-trips a conversation, including optional fields", () => {
    const db = openDb(":memory:");
    const conversation = {
      waId: "59171234567",
      profileName: "Juan Pérez",
      state: "AWAITING_REFERENCIA" as const,
      origen: "Av. América #123",
      destino: "Aeropuerto",
      lastActivity: 1751800000000,
    };

    db.saveConversation(conversation);
    expect(db.getConversation("59171234567")).toEqual(conversation);
    db.close();
  });

  it("overwrites on save for the same waId", () => {
    const db = openDb(":memory:");
    const base = {
      waId: "59171234567",
      profileName: "Juan Pérez",
      state: "AWAITING_ORIGEN" as const,
      lastActivity: 1751800000000,
    };
    db.saveConversation(base);
    db.saveConversation({ ...base, state: "AWAITING_DESTINO", origen: "X" });

    expect(db.getConversation("59171234567")?.state).toBe("AWAITING_DESTINO");
    db.close();
  });

  it("deletes a conversation", () => {
    const db = openDb(":memory:");
    db.saveConversation({
      waId: "59171234567",
      profileName: "Juan",
      state: "AWAITING_ORIGEN",
      lastActivity: 1,
    });
    db.deleteConversation("59171234567");

    expect(db.getConversation("59171234567")).toBeUndefined();
    db.close();
  });
});
