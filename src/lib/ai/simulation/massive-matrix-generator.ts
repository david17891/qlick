/**
 * Sprint v0.9.9 / v17-4 — Massive Matrix Generator (Arnés de Simulación).
 *
 * Genera la matriz cartesiana completa de situaciones de prueba para el
 * Laboratorio IA: `10 arquetipos de prospecto × 4 contextos de modo/oferta
 * × 5 trayectorias de embudo = 200 situaciones únicas documentadas`.
 *
 * Cada `SimulationSituation` es un escenario de conversación predefinido:
 *   - arquetipo (quién es el lead).
 *   - contexto (modo del bot + tipo de evento).
 *   - trayectoria (qué tan largo es el embudo).
 *   - turns[] (mensajes que el "lead" ficticio envía turno a turno).
 *   - assertions (qué esperamos del bot en cada turno).
 *
 * Pure function: NO toca DB, NO hace fetch, NO lee Supabase. La idea es
 * que `generateMassiveMatrix()` se ejecute en <100ms y el arnés (en
 * `matrix-auditor.ts`) corra las 200 situaciones contra un mock del
 * provider para validar las 5 métricas de calidad.
 *
 * @server
 */

export type LeadArchetype =
  | "apresurado"
  | "desconfiado"
  | "tecnico"
  | "fuera_de_horario"
  | "acompanantes"
  | "typo_email"
  | "cadencia_larga"
  | "asesor_humano"
  | "monosilabo"
  | "hostil";

export type ContextKey =
  | "super_executive+free_masterclass"
  | "super_executive+paid_course"
  | "socratic_autopilot_v2+lms_course"
  | "fallback+no_active_event";

export type Trajectory =
  | "quick_convert"
  | "standard_funnel"
  | "deep_objection"
  | "abandonment"
  | "reactivation";

export interface Turn {
  /** Mensaje que el "lead" ficticio envía en este turno. */
  message: string;
  /** Qué esperamos que el bot haga (para el auditor). */
  expect: TurnExpectation;
}

export type TurnExpectation =
  | "answer_brief"
  | "ask_name_and_email"
  | "register_titular"
  | "register_guest"
  | "domain_typ_confirmation"
  | "no_repeat_ask"
  | "escalate_human"
  | "ack"
  | "fallback";

export interface SimulationSituation {
  id: string;
  archetype: LeadArchetype;
  context: ContextKey;
  trajectory: Trajectory;
  description: string;
  turns: Turn[];
  /** Aserciones opcionales a nivel de la situación completa. */
  expectTools?: string[];
  expectNoAlucinacion?: boolean;
  expectTypoIntercepted?: boolean;
  expectCadenciaRespetada?: boolean;
}

export interface ArchetypeDescriptor {
  key: LeadArchetype;
  description: string;
  /** Trayectorias más naturales para este arquetipo. */
  naturalTrajectories: Trajectory[];
  /** Builder de turnos: dado el contexto y la trayectoria, retorna los turnos. */
  buildTurns: (ctx: ContextKey, traj: Trajectory) => Turn[];
}

const ALL_TRAJECTORIES: Trajectory[] = [
  "quick_convert",
  "standard_funnel",
  "deep_objection",
  "abandonment",
  "reactivation"
];

const ALL_CONTEXTS: ContextKey[] = [
  "super_executive+free_masterclass",
  "super_executive+paid_course",
  "socratic_autopilot_v2+lms_course",
  "fallback+no_active_event"
];

/* ------------------------------------------------------------------ */
/* Descriptores de los 10 arquetipos                                 */
/* ------------------------------------------------------------------ */

const ARCHETYPES: Record<LeadArchetype, ArchetypeDescriptor> = {
  apresurado: {
    key: "apresurado",
    description: "Pide costo o link sin saludar, respuesta inmediata.",
    naturalTrajectories: ["quick_convert"],
    buildTurns: (ctx, traj) => [
      { message: "cuánto cuesta?", expect: "answer_brief" },
      { message: "me lo mandas al cel?", expect: "ask_name_and_email" },
      { message: "Juan Pérez, juan@gmail.com", expect: "register_titular" }
    ]
  },
  desconfiado: {
    key: "desconfiado",
    description: "Pregunta por qué es gratis, qué le van a vender.",
    naturalTrajectories: ["standard_funnel", "deep_objection"],
    buildTurns: (ctx, traj) => [
      { message: "y por qué es gratis? me van a vender algo?", expect: "answer_brief" },
      { message: "y después del taller me van a cobrar?", expect: "answer_brief" }
    ]
  },
  tecnico: {
    key: "tecnico",
    description: "Dudas técnicas avanzadas de IA/marketing.",
    naturalTrajectories: ["standard_funnel", "deep_objection"],
    buildTurns: () => [
      { message: "qué stack de IA usan para los embudos?", expect: "answer_brief" },
      { message: "es open source o usa OpenAI?", expect: "answer_brief" }
    ]
  },
  fuera_de_horario: {
    key: "fuera_de_horario",
    description: "Pide grabación porque no puede en la fecha/hora en vivo.",
    naturalTrajectories: ["standard_funnel"],
    buildTurns: () => [
      { message: "no puedo ese día, hay grabación?", expect: "answer_brief" },
      { message: "y si me inscribo igual me la mandan?", expect: "ask_name_and_email" },
      { message: "Ana López, ana@outlook.com", expect: "register_titular" }
    ]
  },
  acompanantes: {
    key: "acompanantes",
    description:
      "Pide inscribir a 2 o 3 socios en el mismo chat. Test de Mejora 1: tool add_event_guest.",
    naturalTrajectories: ["standard_funnel", "deep_objection"],
    buildTurns: (ctx, traj) => [
      { message: "me pueden registrar también a mi socio Carlos?", expect: "register_guest" },
      { message: "y a mi hermano Diego también, es diego@x.com", expect: "register_guest" }
    ]
  },
  typo_email: {
    key: "typo_email",
    description:
      "Da un correo @gmai.com o @hotmai.com. Test de Mejora 3: detección de typos.",
    naturalTrajectories: ["quick_convert", "standard_funnel"],
    buildTurns: () => [
      { message: "me apunto, soy Pedro Ruiz, pedro@gmai.com", expect: "domain_typ_confirmation" }
    ]
  },
  cadencia_larga: {
    key: "cadencia_larga",
    description:
      "Hace 3+ preguntas seguidas antes de dar datos. Test de Mejora 2: cadencia suave.",
    naturalTrajectories: ["deep_objection"],
    buildTurns: (ctx, traj) => {
      const turns: Turn[] = [];
      for (let i = 0; i < 4; i++) {
        turns.push({
          message: `pregunta ${i + 1}: cuánto dura? tiene certificado? qué aprendo? cómo me inscribo?`,
          expect: i === 3 ? "ask_name_and_email" : "no_repeat_ask"
        });
      }
      turns.push({ message: "Lucía Méndez, lucia@gmail.com", expect: "register_titular" });
      return turns;
    }
  },
  asesor_humano: {
    key: "asesor_humano",
    description: "Exige hablar con una persona en vivo.",
    naturalTrajectories: ["standard_funnel", "abandonment"],
    buildTurns: () => [
      { message: "quiero hablar con un humano, no con un bot", expect: "escalate_human" }
    ]
  },
  monosilabo: {
    key: "monosilabo",
    description: "Responde solo 'ok', 'va', 'si'.",
    naturalTrajectories: ["abandonment", "quick_convert"],
    buildTurns: () => [
      { message: "ok", expect: "answer_brief" },
      { message: "si", expect: "ask_name_and_email" },
      { message: "va", expect: "ask_name_and_email" }
    ]
  },
  hostil: {
    key: "hostil",
    description: "Comentarios agresivos o reclamo por spam.",
    naturalTrajectories: ["abandonment"],
    buildTurns: () => [
      { message: "dejen de spamearme por favor!!", expect: "ack" },
      { message: "no me interesa, borren mi número", expect: "ack" }
    ]
  }
};

/* ------------------------------------------------------------------ */
/* Builder principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Genera la matriz cartesiana completa. Por cada (arquetipo, contexto,
 * trayectoria) genera UNA situación con sus turns.
 *
 * @returns Array de SimulationSituation. `length === 10 × 4 × 5 = 200`.
 */
export function generateMassiveMatrix(): SimulationSituation[] {
  const situations: SimulationSituation[] = [];
  const archetypes = Object.values(ARCHETYPES);
  for (const arch of archetypes) {
    for (const ctx of ALL_CONTEXTS) {
      for (const traj of ALL_TRAJECTORIES) {
        const id = `${arch.key}__${ctx}__${traj}`;
        situations.push({
          id,
          archetype: arch.key,
          context: ctx,
          trajectory: traj,
          description: `[${arch.description}] en contexto ${ctx} con trayectoria ${traj}`,
          turns: arch.buildTurns(ctx, traj),
          // Heurísticas de auditoría:
          expectNoAlucinacion: arch.key === "acompanantes",
          expectTypoIntercepted: arch.key === "typo_email",
          expectCadenciaRespetada: arch.key === "cadencia_larga"
        });
      }
    }
  }
  return situations;
}

/* ------------------------------------------------------------------ */
/* API de inspección                                                   */
/* ------------------------------------------------------------------ */

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as LeadArchetype[];
export const CONTEXT_KEYS = ALL_CONTEXTS;
export const TRAJECTORY_KEYS = ALL_TRAJECTORIES;

/**
 * Resumen para el reporte. Devuelve el conteo de situaciones
 * agrupado por arquetipo y por contexto.
 */
export function matrixSummary(matrix: SimulationSituation[]) {
  const byArchetype: Record<string, number> = {};
  const byContext: Record<string, number> = {};
  for (const s of matrix) {
    byArchetype[s.archetype] = (byArchetype[s.archetype] ?? 0) + 1;
    byContext[s.context] = (byContext[s.context] ?? 0) + 1;
  }
  return { byArchetype, byContext, total: matrix.length };
}
