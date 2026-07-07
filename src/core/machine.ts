import { messages } from "./messages.js";

export type ConversationState =
  | "AWAITING_ORIGEN"
  | "AWAITING_DESTINO"
  | "AWAITING_REFERENCIA"
  | "AWAITING_CONFIRM";

export interface Conversation {
  waId: string;
  profileName: string;
  state: ConversationState;
  origen?: string;
  destino?: string;
  referencia?: string;
  lastActivity: number;
}

export type InboundEvent =
  | { type: "text"; text: string }
  | { type: "button"; id: string }
  | { type: "unsupported" };

export interface Button {
  id: string;
  title: string;
}

export interface Order {
  nombre: string;
  telefono: string;
  origen: string;
  destino: string;
  referencia?: string;
}

export type Action =
  | { type: "reply_text"; text: string }
  | { type: "reply_buttons"; text: string; buttons: Button[] }
  | { type: "forward_order"; order: Order };

export interface TransitionContext {
  now: number;
  timeoutMs: number;
  profileName: string;
  waId: string;
}

export interface TransitionResult {
  /** null means the conversation ended (confirmed or cancelled). */
  conversation: Conversation | null;
  actions: Action[];
}

const CONFIRM_BUTTONS: Button[] = [
  { id: "confirmar", title: "Confirmar" },
  { id: "cancelar", title: "Cancelar" },
];

const OMITIR_BUTTONS: Button[] = [{ id: "omitir", title: "Omitir" }];

export function transition(
  conversation: Conversation | undefined,
  event: InboundEvent,
  ctx: TransitionContext,
): TransitionResult {
  const stale = conversation && ctx.now - conversation.lastActivity > ctx.timeoutMs;
  if (!conversation || stale) {
    return start(ctx, stale ? messages.greetingAgain(ctx.profileName) : messages.greeting(ctx.profileName));
  }

  if (event.type === "text" && isCancelKeyword(event.text)) {
    return { conversation: null, actions: [{ type: "reply_text", text: messages.cancelled }] };
  }

  const next: Conversation = { ...conversation, lastActivity: ctx.now };

  switch (conversation.state) {
    case "AWAITING_ORIGEN":
      if (event.type === "text") {
        next.origen = event.text;
        next.state = "AWAITING_DESTINO";
        return { conversation: next, actions: [{ type: "reply_text", text: messages.askDestino }] };
      }
      break;

    case "AWAITING_DESTINO":
      if (event.type === "text") {
        next.destino = event.text;
        next.state = "AWAITING_REFERENCIA";
        return {
          conversation: next,
          actions: [{ type: "reply_buttons", text: messages.askReferencia, buttons: OMITIR_BUTTONS }],
        };
      }
      break;

    case "AWAITING_REFERENCIA":
      if (event.type === "text" || (event.type === "button" && event.id === "omitir")) {
        if (event.type === "text") next.referencia = event.text;
        next.state = "AWAITING_CONFIRM";
        return { conversation: next, actions: [summaryAction(next)] };
      }
      break;

    case "AWAITING_CONFIRM":
      if (event.type === "button" && event.id === "confirmar") {
        return {
          conversation: null,
          actions: [
            { type: "forward_order", order: toOrder(conversation) },
            { type: "reply_text", text: messages.confirmed },
          ],
        };
      }
      if (event.type === "button" && event.id === "cancelar") {
        return { conversation: null, actions: [{ type: "reply_text", text: messages.cancelled }] };
      }
      // Anything else: re-show the summary so the buttons are back on screen.
      return { conversation: next, actions: [summaryAction(next)] };
  }

  // Unsupported message type (or a button that doesn't apply): repeat the pending question.
  return { conversation: next, actions: [reAsk(next)] };
}

function start(ctx: TransitionContext, greeting: string): TransitionResult {
  return {
    conversation: {
      waId: ctx.waId,
      profileName: ctx.profileName,
      state: "AWAITING_ORIGEN",
      lastActivity: ctx.now,
    },
    actions: [{ type: "reply_text", text: greeting }],
  };
}

function isCancelKeyword(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized === "cancelar";
}

function reAsk(c: Conversation): Action {
  switch (c.state) {
    case "AWAITING_ORIGEN":
      return { type: "reply_text", text: `${messages.unsupported}\n${messages.askOrigen}` };
    case "AWAITING_DESTINO":
      return { type: "reply_text", text: `${messages.unsupported}\n${messages.askDestino}` };
    case "AWAITING_REFERENCIA":
      return { type: "reply_buttons", text: `${messages.unsupported}\n${messages.askReferencia}`, buttons: OMITIR_BUTTONS };
    case "AWAITING_CONFIRM":
      return summaryAction(c);
  }
}

function toOrder(c: Conversation): Order {
  return {
    nombre: c.profileName,
    telefono: c.waId,
    origen: c.origen ?? "",
    destino: c.destino ?? "",
    ...(c.referencia !== undefined && { referencia: c.referencia }),
  };
}

function summaryAction(c: Conversation): Action {
  return {
    type: "reply_buttons",
    text: messages.summary({
      nombre: c.profileName,
      origen: c.origen ?? "",
      destino: c.destino ?? "",
      referencia: c.referencia,
    }),
    buttons: CONFIRM_BUTTONS,
  };
}
