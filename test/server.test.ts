import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { testConfig } from "./helpers.js";

describe("GET /health", () => {
  it("returns 200", async () => {
    const app = await buildServer(testConfig());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
