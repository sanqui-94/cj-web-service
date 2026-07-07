import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { testConfig } from "./helpers.js";

function sign(body: string, secret = "test-app-secret"): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const minimalEvent = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

describe("GET /webhook (verification handshake)", () => {
  it("echoes hub.challenge when mode and verify token are correct", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({
      method: "GET",
      url: "/webhook",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "test-verify-token",
        "hub.challenge": "1158201444",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("1158201444");
    await app.close();
  });

  it("rejects an incorrect verify token with 403", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({
      method: "GET",
      url: "/webhook",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "1158201444",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("POST /webhook (event delivery)", () => {
  it("accepts a payload with a valid X-Hub-Signature-256", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(minimalEvent),
      },
      payload: minimalEvent,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a payload with an invalid signature with 401", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(minimalEvent, "attacker-secret"),
      },
      payload: minimalEvent,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a payload with no signature header with 401", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { "content-type": "application/json" },
      payload: minimalEvent,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
