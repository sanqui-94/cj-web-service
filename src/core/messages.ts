export const COMPANY_NAME = "Radio Taxi Ciudad Jardín";

export interface OrderSummary {
  nombre: string;
  origen: string;
  destino: string;
  referencia?: string;
}

const ASK_ORIGEN = "¿Dónde te recogemos? Escribe la dirección (calle, número y zona).";

export const messages = {
  greeting: (name: string) => `¡Hola ${name}! 🚕 Soy el asistente de ${COMPANY_NAME}.\n${ASK_ORIGEN}`,

  greetingAgain: (name: string) => `¡Hola de nuevo ${name}! 👋 Empecemos otra vez.\n${ASK_ORIGEN}`,

  askOrigen: ASK_ORIGEN,

  askDestino: "Perfecto ✅ ¿A dónde te llevamos?",

  askReferencia:
    "¿Alguna referencia para encontrarte más fácil? " +
    '(ej. "portón negro", "frente a la farmacia")\n' +
    "Si no hay, toca Omitir.",

  summary: ({ nombre, origen, destino, referencia }: OrderSummary) =>
    "📋 Tu pedido:\n" +
    `👤 ${nombre}\n` +
    `📍 Origen: ${origen}\n` +
    `🏁 Destino: ${destino}\n` +
    (referencia ? `📝 Referencia: ${referencia}\n` : "") +
    "\n¿Confirmamos tu pedido?",

  confirmed: "¡Listo! 🚕 Tu pedido fue enviado. En breve un taxi se pondrá en camino.",

  cancelled: "Pedido cancelado. Escríbenos cuando necesites un taxi 🚕",

  unsupported: "Solo puedo leer mensajes de texto 🙏",

  deliveryFailed: (phone: string) =>
    `😔 No pudimos procesar tu pedido en este momento. Por favor llámanos al ${phone}.`,
};
