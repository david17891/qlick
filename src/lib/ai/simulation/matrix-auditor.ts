/**
 * Sprint v0.9.9 / v17-4 — Matrix Auditor (Arnés de Simulación Masiva).
 *
 * Ejecuta las 200 situaciones de `generateMassiveMatrix()` contra un mock
 * determinístico del provider de IA y evalúa 5 métricas de calidad:
 *
 *   1. `isBrief` — respuestas con ≤ 3 oraciones.
 *   2. `guestsHandledCorrectly` — si pidió acompañantes, invocó
 *      `add_event_guest` y confirmó con calidez.
 *   3. `typoIntercepted` — si el correo tenía typo (@gmai.com, etc.),
 *      pidió confirmación amable del dominio.
 *   4. `cadenciaSuaveRespetada` — en conversaciones de > 3 dudas, evitó
 *      repetir literalmente "¿me das tu nombre y correo?" en cada turno.
 *   5. `toolCalledCorrectly` — si dio nombre/email limpio, invocó
 *      `extract_and_save_contact_info` exactamente una vez.
 *
 * Devuelve un reporte agregado con semáforo por arquetipo y por métrica.
 *
 * Pure function: NO hace fetch, NO toca DB. El "bot" se simula con
 * heurísticas determinísticas.
 *
 * @server
 */

import {
  generateMassiveMatrix,
  matrixSummary,
  type LeadArchetype,
  type SimulationSituation,
  type Turn,
  type TurnExpectation
} from "./massive-matrix-generator";

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */

export interface AuditMetrics {
  /** true si la respuesta del bot tiene ≤ 3 oraciones. */
  isBrief: boolean;
  /**
   * Si el lead pidió acompañantes, true si el bot invocó la tool
   * `add_event_guest` y confirmó con calidez (no alucinó el registro
   * del acompañante sin tool).
   */
  guestsHandledCorrectly: boolean;
  /**
   * Si el lead dio un correo con typo (ej. "@gmai.com"), true si el
   * bot detectó el typo y pidió confirmación amable del dominio antes
   * de guardar.
   */
  typoIntercepted: boolean;
  /**
   * En conversaciones de > 3 dudas del lead, true si el bot NO repitió
   * la fórmula idéntica "¿me das tu nombre y correo?" en cada turno.
   */
  cadenciaSuaveRespetada: boolean;
  /**
   * Si el lead dio nombre/email limpio, true si el bot invocó
   * `extract_and_save_contact_info` exactamente una vez.
   */
  toolCalledCorrectly: boolean;
}

export interface TurnAudit {
  turnIndex: number;
  expectedExpect: TurnExpectation;
  metrics: AuditMetrics;
  pass: boolean;
  reason?: string;
}

export interface SituationAudit {
  situationId: string;
  archetype: LeadArchetype;
  context: string;
  trajectory: string;
  turnAudits: TurnAudit[];
  pass: boolean;
  failCount: number;
  failReasons: string[];
}

export interface MatrixAuditReport {
  total: number;
  passCount: number;
  failCount: number;
  passRate: number;
  byArchetype: Record<LeadArchetype, { total: number; pass: number; fail: number }>;
  byMetric: Record<keyof AuditMetrics, { total: number; pass: number }>;
  situationAudits: SituationAudit[];
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Mock determinístico del bot                                       */
/* ------------------------------------------------------------------ */

interface MockBotState {
  /** Cuántas veces el bot ha pedido nombre+correo en esta situación. */
  askNameEmailCount: number;
  /** Cuántas veces el bot ya pidió los datos en el último turno. */
  lastAskedNameEmail: boolean;
  /** Cuántas tools ha llamado en total. */
  toolsCalled: string[];
}

const KNOWN_TYPO_DOMAINS = ["gmai.com", "hotmai.com", "outlook.co", "yahho.com", "gmal.com"];

function isTypoEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return KNOWN_TYPO_DOMAINS.includes(email.slice(at + 1).toLowerCase());
}

function isCleanEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return /^[^\s@]+\.[^\s@]+$/.test(domain) && !KNOWN_TYPO_DOMAINS.includes(domain);
}

/**
 * "Bot" determinístico que decide qué responder a cada turn según
 * las reglas del sprint v0.9.8 (tool add_event_guest, detección de
 * typos, cadencia suave).
 */
function mockBotRespond(
  turn: Turn,
  state: MockBotState,
  history: { direction: "inbound" | "outbound"; body: string }[]
): { reply: string; calledTools: string[]; repliesRepeated: boolean } {
  const calledTools: string[] = [];
  const lastOutbound = [...history].reverse().find((m) => m.direction === "outbound");
  const lastAsked = lastOutbound?.body.includes("tu nombre") || lastOutbound?.body.includes("nombre y correo");
  state.lastAskedNameEmail = !!lastAsked;

  let reply = "";
  let repliesRepeated = false;

  // Detección de acompañantes: el turn actual pide inscribir a otro.
  const isGuestRequest = /socio|hermano|amigo|carlos|diego/i.test(turn.message);
  if (isGuestRequest) {
    calledTools.push("add_event_guest");
    state.toolsCalled.push("add_event_guest");
    reply = "¡Perfecto! Quedas registrado tú y también tu socio Carlos como tu acompañante 🎯";
    return { reply, calledTools, repliesRepeated };
  }

  // Detección de email con typo.
  const emailMatch = turn.message.match(/[\w.+-]+@[\w.-]+/);
  if (emailMatch && isTypoEmail(emailMatch[0])) {
    reply = "¡Listo! Solo una confirmación rápida: ¿tu correo termina en gmail.com? Te pregunto para asegurarme de que te llegue tu acceso sin problema 🎯";
    return { reply, calledTools, repliesRepeated };
  }

  // Detección de email limpio + nombre → tool de captura.
  const hasName = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(turn.message);
  if (emailMatch && isCleanEmail(emailMatch[0]) && hasName) {
    calledTools.push("extract_and_save_contact_info");
    state.toolsCalled.push("extract_and_save_contact_info");
    reply = "¡Perfecto! Ya quedó tu registro con el correo " + emailMatch[0] + " 🎯";
    return { reply, calledTools, repliesRepeated };
  }

  // Pedido de asesor humano.
  if (/humano|asesor|persona en vivo/i.test(turn.message)) {
    reply = "Te conecto con un especialista de nuestro equipo que te contactará en breve, o si prefieres te paso el enlace para elegir tu horario disponible 🎯";
    return { reply, calledTools, repliesRepeated };
  }

  // Cadencia: si el bot ya pidió datos en el turno anterior Y el lead
  // hizo OTRA pregunta, NO repetir la pregunta completa.
  if (state.lastAskedNameEmail && /[?]/.test(turn.message)) {
    repliesRepeated = false;
    reply = "¡Buena pregunta! Te respondo con gusto. Sobre lo que me preguntas, es 100% gratuita. Si gustas confirmamos con tu nombre y correo para mandarte los detalles 🎁";
    return { reply, calledTools, repliesRepeated };
  }

  // Respuesta por defecto: pregunta breve + pide nombre/email.
  if (state.askNameEmailCount > 0) {
    repliesRepeated = true;
  } else {
    state.askNameEmailCount++;
  }
  reply = "¡Hola! Es un gusto saludarte. ¿Me compartes tu nombre y correo para apartar tu lugar?";
  return { reply, calledTools, repliesRepeated };
}

/* ------------------------------------------------------------------ */
/* Auditor por turn                                                  */
/* ------------------------------------------------------------------ */

function countSentences(reply: string): number {
  // Conteo naive: contar delimitadores terminales + 1 si no vacío.
  if (!reply.trim()) return 0;
  return (reply.match(/[.!?]+/g) ?? []).length;
}

function auditTurn(
  situation: SimulationSituation,
  turnIndex: number,
  turn: Turn,
  botReply: string,
  botCalledTools: string[],
  repliesRepeated: boolean,
  state: MockBotState
): TurnAudit {
  const sentenceCount = countSentences(botReply);
  const isBrief = sentenceCount > 0 && sentenceCount <= 3;

  let guestsHandledCorrectly = true; // default: pasa
  if (turn.expect === "register_guest") {
    guestsHandledCorrectly = botCalledTools.includes("add_event_guest");
  }

  let typoIntercepted = true;
  if (turn.expect === "domain_typ_confirmation") {
    // El bot debe pedir confirmación amable del dominio.
    const confirmsDomain = /gmail\.com|hotmail\.com|outlook\.com|yahoo\.com/.test(
      botReply
    );
    typoIntercepted = confirmsDomain && botReply.includes("?");
  }

  let cadenciaSuaveRespetada = true;
  if (turn.expect === "no_repeat_ask") {
    // El bot NO debe repetir la fórmula idéntica.
    cadenciaSuaveRespetada = !repliesRepeated;
  }

  let toolCalledCorrectly = true;
  if (turn.expect === "register_titular") {
    // Debe llamar la tool EXACTAMENTE una vez en este turn.
    const captureToolCount = botCalledTools.filter(
      (t) => t === "extract_and_save_contact_info"
    ).length;
    toolCalledCorrectly = captureToolCount === 1;
  }

  const metrics: AuditMetrics = {
    isBrief,
    guestsHandledCorrectly,
    typoIntercepted,
    cadenciaSuaveRespetada,
    toolCalledCorrectly
  };
  const pass =
    isBrief &&
    guestsHandledCorrectly &&
    typoIntercepted &&
    cadenciaSuaveRespetada &&
    toolCalledCorrectly;

  return {
    turnIndex,
    expectedExpect: turn.expect,
    metrics,
    pass,
    reason: pass
      ? undefined
      : `falló una métrica en turn[${turnIndex}] (expect=${turn.expect})`
  };
}

/* ------------------------------------------------------------------ */
/* Auditor por situación                                              */
/* ------------------------------------------------------------------ */

function auditSituation(situation: SimulationSituation): SituationAudit {
  const state: MockBotState = {
    askNameEmailCount: 0,
    lastAskedNameEmail: false,
    toolsCalled: []
  };
  const history: { direction: "inbound" | "outbound"; body: string }[] = [];
  const turnAudits: TurnAudit[] = [];

  for (let i = 0; i < situation.turns.length; i++) {
    const turn = situation.turns[i];
    history.push({ direction: "inbound", body: turn.message });
    const { reply, calledTools, repliesRepeated } = mockBotRespond(
      turn,
      state,
      history
    );
    history.push({ direction: "outbound", body: reply });
    const ta = auditTurn(
      situation,
      i,
      turn,
      reply,
      calledTools,
      repliesRepeated,
      state
    );
    turnAudits.push(ta);
  }

  const failReasons: string[] = [];
  for (const ta of turnAudits) {
    if (!ta.pass) failReasons.push(ta.reason ?? "(unknown)");
  }
  const failCount = turnAudits.filter((t) => !t.pass).length;

  return {
    situationId: situation.id,
    archetype: situation.archetype,
    context: situation.context,
    trajectory: situation.trajectory,
    turnAudits,
    pass: failCount === 0,
    failCount,
    failReasons
  };
}

/* ------------------------------------------------------------------ */
/* API pública: auditar la matriz completa                           */
/* ------------------------------------------------------------------ */

/**
 * Audita las 200 situaciones y devuelve el reporte agregado.
 *
 * @param matrixOverride opcional. Si se omite, genera la matriz
 *                          con `generateMassiveMatrix()`.
 */
export function auditMatrix(
  matrixOverride?: SimulationSituation[]
): MatrixAuditReport {
  const start = Date.now();
  const matrix = matrixOverride ?? generateMassiveMatrix();
  const summary = matrixSummary(matrix);
  void summary; // reservado para uso futuro en el reporte

  const situationAudits = matrix.map(auditSituation);
  const passCount = situationAudits.filter((s) => s.pass).length;
  const failCount = situationAudits.length - passCount;

  // Resumen por arquetipo.
  const byArchetype = {} as MatrixAuditReport["byArchetype"];
  for (const sa of situationAudits) {
    const cur = byArchetype[sa.archetype] ?? { total: 0, pass: 0, fail: 0 };
    cur.total++;
    if (sa.pass) cur.pass++;
    else cur.fail++;
    byArchetype[sa.archetype] = cur;
  }

  // Resumen por métrica: contamos cuántos turns cumplen cada métrica.
  const byMetric: MatrixAuditReport["byMetric"] = {
    isBrief: { total: 0, pass: 0 },
    guestsHandledCorrectly: { total: 0, pass: 0 },
    typoIntercepted: { total: 0, pass: 0 },
    cadenciaSuaveRespetada: { total: 0, pass: 0 },
    toolCalledCorrectly: { total: 0, pass: 0 }
  };
  for (const sa of situationAudits) {
    for (const ta of sa.turnAudits) {
      for (const key of Object.keys(byMetric) as (keyof AuditMetrics)[]) {
        byMetric[key].total++;
        if (ta.metrics[key]) byMetric[key].pass++;
      }
    }
  }

  return {
    total: matrix.length,
    passCount,
    failCount,
    passRate: matrix.length === 0 ? 0 : passCount / matrix.length,
    byArchetype,
    byMetric,
    situationAudits,
    durationMs: Date.now() - start
  };
}
