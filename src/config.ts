export interface Config {
  port: number;
  dbPath: string;
  whatsapp: {
    apiToken: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
    graphApiVersion: string;
  };
  company: {
    /** Number that receives confirmed orders, digits only e.g. "59170000000" */
    whatsappNumber: string;
    /** Phone shown to users when delivery fails, e.g. "4-4444444" */
    phoneDisplay: string;
    /** Approved Meta template used to deliver orders */
    templateName: string;
  };
  conversationTimeoutMinutes: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "data/cj-web-service.sqlite",
    whatsapp: {
      apiToken: required(env, "WHATSAPP_API_TOKEN"),
      phoneNumberId: required(env, "WHATSAPP_PHONE_NUMBER_ID"),
      verifyToken: required(env, "WHATSAPP_VERIFY_TOKEN"),
      appSecret: required(env, "WHATSAPP_APP_SECRET"),
      graphApiVersion: env.WHATSAPP_API_VERSION ?? "v23.0",
    },
    company: {
      whatsappNumber: required(env, "COMPANY_WHATSAPP_NUMBER"),
      phoneDisplay: required(env, "COMPANY_PHONE_DISPLAY"),
      templateName: env.TEMPLATE_NAME ?? "nuevo_pedido",
    },
    conversationTimeoutMinutes: Number(env.CONVERSATION_TIMEOUT_MINUTES ?? 30),
  };
}
