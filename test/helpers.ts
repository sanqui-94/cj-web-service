import type { Config } from "../src/config.js";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    dbPath: ":memory:",
    whatsapp: {
      apiToken: "test-api-token",
      phoneNumberId: "111111111111111",
      verifyToken: "test-verify-token",
      appSecret: "test-app-secret",
      graphApiVersion: "v23.0",
    },
    company: {
      whatsappNumber: "59170000000",
      phoneDisplay: "4-4444444",
      templateName: "nuevo_pedido",
    },
    conversationTimeoutMinutes: 30,
    ...overrides,
  };
}
