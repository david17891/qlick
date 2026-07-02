/**
 * Prompts del Agente IA de Qlick.
 *
 * Cada prompt inyecta:
 *  - El perfil del negocio (tono, reglas, cursos).
 *  - El contexto del evento activo (nombre, fecha, lugar, agenda).
 *  - La ventana de conversación (últimos N mensajes del lead).
 *  - Las restricciones de guardrails (qué NO hacer).
 *
 * Ver docs/BOT_CONTEXT_DESIGN.md y docs/AI_AGENT_GUARDRAILS.md.
 */

import type { AIAgentProfile } from "@/types";

import type { ActiveEventContext } from "./event-context-loader";
import type { ConversationWindow } from "./conversation-window";
import type { AgentContext, AgentTask } from "./agent-provider";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface ExtendedAgentContext extends AgentContext {
  /** Evento activo cargado desde DB (o fallback env). */
  activeEvent?: ActiveEventContext;
  /**
   * Bloque de catalogo completo de eventos publicados. Si esta presente
   * y tiene mas de 1 evento, se usa en vez de `activeEvent.promptBlock`.
   * FIX 2026-07-02 (sesion David): bot multi-evento.
   */
  eventsListBlock?: string;
  /** Ventana de últimos mensajes del lead. */
  conversationWindow?: ConversationWindow;
}

/* ------------------------------------------------------------------ */
/*  System prompt                                                      */
/* ------------------------------------------------------------------ */

/** System prompt base: identidad, alcance, límites y contexto del evento. */
export function buildSystemPrompt(
  profile: AIAgentProfile,
  activeEvent?: ActiveEventContext,
  isFirstMessage: boolean = true,
  eventsListBlock?: string
): string {
  const lines: string[] = [
    `Eres ${profile.name}, asistente conversacional de ${profile.businessName}.`,
    `${profile.businessDescription}`,
    ``,
    `Atiendes en horario: ${profile.businessHours}.`,
    `Tono: ${profile.tone}, MUY amable, cálido y cercano. Idioma: español de México.`,
    ``,
    `Personalidad:`,
    isFirstMessage
      ? `- Saluda al lead por su nombre (si lo conoces y NO es un placeholder como "Por confirmar") en este primer mensaje.`
      : `- ⚠️⚠️⚠️ NO es el primer mensaje. Tu respuesta DEBE empezar DIRECTO respondiendo al último mensaje del lead. NUNCA con saludo, NUNCA con "Hola, gracias por escribir", NUNCA con "Por, gracias por escribir", NUNCA presentándote. La primera palabra/frase de tu respuesta debe ser la respuesta al mensaje del lead. Si el lead pregunta "costo", empieza con el costo. Si pregunta "horario", empieza con el horario. Ve DIRECTO al grano.`,
    `- Eres paciente, nunca apuras al usuario.`,
    `- Si no entiendes algo, preguntas con amabilidad en vez de inventar.`,
    `- Nunca discutes; si el usuario está molesto, lo escuchas y ofreces solución.`,
    `- Usas "tú" (no "usted"). Usas expresiones naturales de México.`,
    ``,
    `Conoces estos cursos/servicios:`,
    ...profile.servicesOrCourses.map((c) => `- ${c}`),
    ``,
    `LO QUE PUEDES HACER:`,
    ...profile.allowedActions.map((a) => `- ${a}`),
    ``,
    `LO QUE NUNCA DEBES HACER:`,
    ...profile.forbiddenActions.map((a) => `- ${a}`),
    ``,
    `REGLAS DE ESCALAMIENTO:`,
    ...profile.escalationRules.map((r) => `- ${r}`),
    ``,
    `Si no estás seguro o falta información, responde:`,
    `"${profile.fallbackMessage}"`
  ];

  // Inyectar contexto del evento(s) activo(s) (si hay).
  // FIX 2026-07-02 (sesion David):
  //   - Si hay CATALOGO (varios eventos), inyecta el listado para que el LLM
  //     pueda identificar sobre cual le preguntan.
  //   - Si hay 1 solo evento, inyecta su promptBlock.
  //   - El LLM estaba inventando precios y otros datos que no estan en el
  //     bloque. Reforzamos con:
  //     1. Listado explicito de QUE tienes disponible (no solo "el bloque de arriba")
  //     2. Listado explicito de QUE NO tienes (no inventes)
  //     3. Plantilla exacta de respuesta cuando falta info
  //     4. Tono: humano, conciso, real (max 2-3 oraciones)
  const hasCatalog = eventsListBlock && eventsListBlock.trim().length > 0;
  if (hasCatalog) {
    lines.push(``, eventsListBlock!);
    lines.push(
      ``,
      `=== COMPORTAMIENTO CON EL CATALOGO DE EVENTOS ===`,
      ``,
      `Cuando el lead pregunta sobre un evento:`,
      `- Si el mensaje es GENERICO ('que eventos tienen?', 'que hay?', 'cuentame'): lista los [1], [2], [3] con nombre, fecha, lugar, duracion, precio (si esta en Detalles).`,
      `- Si pregunta sobre UNO especifico ('el de CDMX', 'el del 12 de julio', 'el de ads', 'el segundo'): identifica cual es y responde SOLO sobre ese.`,
      `- Si pregunta sobre VARIOS ('el de CDMX y el online'): responde sobre cada uno por separado.`,
      `- Si la referencia es AMBIGUA: 'Cual te interesa: [1], [2] o [3]?'`,
      ``,
      `Datos que SI tienes POR CADA EVENTO (de 'Detalles' en el bloque de arriba):`,
      `- Modalidad (presencial/online)`,
      `- Precio (si esta escrito en Detalles)`,
      `- Cupo (si esta escrito en Detalles)`,
      `- Materiales (si esta escrito en Detalles)`,
      `SOLO lo que este escrito en 'Detalles'. Todo lo demas NO lo tienes.`,
      ``,
      `LO QUE NUNCA DEBES INVENTAR (regla dura):`,
      `- PRECIO / COSTO. Si el lead pregunta costo y no hay precio en Detalles, responde EXACTAMENTE: "Aun no tengo el precio confirmado, lo reviso con el equipo y te paso. ?Te interesa apartar tu lugar?"`,
      `- Temario detallado / temas especificos (mas alla de lo que diga Detalles)`,
      `- Nombre del expositor / ponente`,
      `- Direccion exacta del lugar (solo tienes el nombre del venue, no la calle)`,
      `- Cupo disponible / lugares restantes`,
      `- Cualquier numero, fecha, hora o dato que NO este escrito en el bloque`,
      ``,
      `SI TE FALTA INFO, usa esta plantilla:`,
      `"[Lo que SI sabes] + 'Aun no tengo [el dato que falta] confirmado, lo reviso y te paso. ?Te interesa que te avise cuando lo tenga?'"`,
      ``,
      `TONO DE LA RESPUESTA:`,
      `- Humano, conciso, real. Max 2-3 oraciones en WhatsApp.`,
      `- Sin emojis excesivos (max 1 por mensaje).`,
      `- Empieza DIRECTO con la info del evento, sin saludo ni presentacion.`,
      `- NO uses frases vagas tipo 'te contactaremos pronto' si tienes dato concreto.`
    );
  } else if (activeEvent) {
    lines.push(``, activeEvent.promptBlock);
    lines.push(
      ``,
      `=== COMPORTAMIENTO CUANDO EL LEAD PREGUNTA SOBRE EL EVENTO ===`,
      ``,
      `LO QUE SI TIENES del evento (en el bloque EVENTO ACTIVO arriba):`,
      `- Nombre del evento`,
      `- Fecha y hora de inicio`,
      `- Duracion`,
      `- Lugar`,
      `SOLO esos 4 datos. Todo lo demas NO lo tienes.`,
      ``,
      `LO QUE NUNCA DEBES INVENTAR (regla dura):`,
      `- PRECIO / COSTO. Si el lead pregunta costo y no hay precio en el bloque, responde EXACTAMENTE: "Aun no tengo el precio confirmado, lo reviso con el equipo y te paso. ?Te interesa apartar tu lugar?"`,
      `- Temario detallado / temas especificos`,
      `- Nombre del expositor / ponente`,
      `- Direccion exacta del lugar (solo tienes el nombre, no la calle)`,
      `- Cupo disponible / lugares restantes`,
      `- Cualquier numero, fecha, hora o dato que NO este escrito arriba`,
      ``,
      `SI TE FALTA INFO, usa esta plantilla:`,
      `"[Lo que SI sabes del bloque] + 'Aun no tengo [el dato que falta] confirmado, lo reviso y te paso. ?Te interesa que te avise cuando lo tenga?'"`,
      ``,
      `TONO DE LA RESPUESTA:`,
      `- Humano, conciso, real. Max 2-3 oraciones en WhatsApp.`,
      `- Sin emojis excesivos (max 1 por mensaje).`,
      `- Empieza DIRECTO con la info del evento, sin saludo ni presentacion.`,
      `- NO uses frases vagas tipo 'te contactaremos pronto' si tienes dato concreto.`
    );
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Task prompt                                                        */
/* ------------------------------------------------------------------ */

/**
 * Prompt de usuario por tarea, inyectando el contexto del lead + ventana
 * de conversación.
 */
export function buildTaskPrompt(
  task: AgentTask,
  context: ExtendedAgentContext
): string {
  const {
    leadName,
    courseOfInterest,
    lastIncomingMessage,
    conversationSummary,
    activeEvent,
    conversationWindow,
    leadProfile
  } = context;

  const ctxBlocks: string[] = [];

  // Bloque 0: contexto persistente entre sesiones (memoria larga).
  if (leadProfile?.summary) {
    ctxBlocks.push(
      `CONTEXTO PREVIO DEL LEAD (memoria persistente entre sesiones):\n${leadProfile.summary}`
    );
  }

  // Bloque 1: Identidad del lead.
  ctxBlocks.push(
    [
      leadName ? `Lead: ${leadName}` : "Lead: (sin nombre)",
      courseOfInterest
        ? `Curso de interés: ${courseOfInterest}`
        : "Curso de interés: (no definido)",
      conversationSummary
        ? `Resumen previo: ${conversationSummary}`
        : ""
    ]
      .filter(Boolean)
      .join("\n")
  );

  // Bloque 2: ventana de conversación (cronológica).
  if (conversationWindow && conversationWindow.messages.length > 0) {
    ctxBlocks.push(conversationWindow.promptBlock);
    // Refuerzo explícito: si hay historial, no repitas saludo.
    // El system prompt ya lo dice, pero el LLM a veces lo ignora
    // cuando la regla está lejos del contexto del historial.
    ctxBlocks.push(
      "⚠️ RECORDATORIO: hay historial de conversación arriba. " +
      "NO repitas saludo, NO digas 'Hola, gracias por escribir', " +
      "NO te presentes de nuevo. Responde DIRECTO al último mensaje del lead."
    );
  }

  // Bloque 3: último mensaje (con highlight).
  if (lastIncomingMessage) {
    ctxBlocks.push(
      `>>> ÚLTIMO MENSAJE DEL LEAD (al que tienes que responder): "${lastIncomingMessage}"`
    );
  }

  // Bloque 4: instrucciones de la tarea.
  const instructions: Record<AgentTask, string> = {
    classify_intent:
      "Clasifica la intención del lead en una sola etiqueta. Responde solo con la etiqueta.",
    suggest_reply:
      "Redacta una respuesta corta (máx 2 párrafos, ≤500 chars) para enviar al lead.\n" +
      "- Tono amable, cálido, mexicano.\n" +
      "- Si hay EVENTO ACTIVO en el contexto y el mensaje del lead es sobre ese evento, ÚSALO.\n" +
      "- Si el lead pregunta por el evento, incluye nombre, fecha y lugar en tu respuesta.\n" +
      "- NO confirmes pagos, accesos, ni descuentos.\n" +
      "- NO uses frases vagas tipo 'te contactaremos pronto' si tienes info concreta.\n" +
      // FIX 2026-07-02 (sesion David): bot multi-evento + QR.
      // El LLM debe confirmar el evento antes de pedir email, para que
      // el bot-engine pueda identificar a cual evento registrar.
      "- Si el lead quiere REGISTRARSE, SIEMPRE confirma primero el evento " +
      "mencionando nombre y fecha (e.g. 'Te registro para IA y Marketing: " +
      "Primeros Pasos del 12 de julio. Mandame tu email por favor'). " +
      "Si el lead no dijo a cual evento, pregunta 'Cual te interesa: [1], [2] o [3]?' antes de pedir el email.",
    summarize_conversation:
      "Resume la conversación en 1-2 frases, destacando el siguiente paso concreto.",
    detect_urgency:
      "Indica si el mensaje tiene urgencia y por qué. Sé conservador.",
    detect_payment_pending:
      "Indica si hay señal de pago pendiente o problema de pago. No confirmes ni canceles nada.",
    recommend_course:
      "Recomienda UN curso de la lista conocida. Si no hay suficiente info, di que falta contexto.",
    escalate_to_human:
      "Decide si este caso debe escalar a humano y por qué. Sugiere a quién escalar."
  };

  ctxBlocks.push(`Tarea: ${instructions[task]}`);

  // Si hay evento activo, agregar recordatorio final.
  // FIX 2026-07-02: reforzar que NO invente datos, y que use la
  // plantilla de "no tengo el dato" si falta info.
  // FIX 2026-07-02 (v2): si hay eventsListBlock, usarlo en vez del activeEvent.
  if (context.eventsListBlock) {
    ctxBlocks.push(
      `\nRecordatorio final: hay VARIOS eventos publicados. ` +
      `Identifica sobre cual te preguntan (por numero, fecha, lugar o titulo) y responde SOLO sobre ese. ` +
      `NO inventes datos que no esten en 'Detalles' del bloque de arriba. ` +
      `Si falta info, di "aun no tengo [dato] confirmado, lo reviso y te paso" y pregunta si le interesa que le avises.`
    );
  } else if (activeEvent) {
    ctxBlocks.push(
      `\nRecordatorio final: el evento activo es "${activeEvent.title}" el ${activeEvent.humanStartsAt}. ` +
      `Datos disponibles: nombre, fecha, duracion, lugar. ` +
      `Si el lead pregunta por algo MAS (precio, temario, expositor, direccion exacta, cupo), ` +
      `NO inventes. Di "aun no tengo [dato] confirmado, lo reviso y te paso" y pregunta si le interesa que le avises.`
    );
  }

  return ctxBlocks.join("\n\n");
}