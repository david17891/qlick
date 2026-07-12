/**
 * Tipos del dominio CRM + WhatsApp AI Agent de Qlick.
 *
 * Estos tipos son la fuente de verdad del modelo comercial (leads, pipeline,
 * conversaciones, tareas, citas, agente IA y configuración de WhatsApp).
 *
 * Al igual que `src/types/index.ts`, los datos mock en `src/lib/data/crm-data.ts`
 * implementan estos tipos. En una fase posterior se mapearán a tablas reales
 * (Supabase) sin cambiar la superficie pública de los servicios.
 *
 * NOTA: ningún tipo aquí implica conexión a una API externa. Todo el modelo está
 * pensado para funcionar en modo demo (mock) y migrar después.
 */

import type { Database } from "@/types/supabase";

type BotPauseReason = Database["public"]["Enums"]["bot_pause_reason"];

/* ------------------------------------------------------------------ */
/* Catálogos base (uniones literales)                                  */
/* ------------------------------------------------------------------ */

/** Etapa del lead dentro del pipeline comercial. */
export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "qualified"
  | "info_requested"
  | "payment_pending"
  | "enrolled"
  | "active_student"
  | "event_attended"
  | "survey_completed"
  | "lost"
  | "archived";

/** Bucketed score derivado de la encuesta post-evento. */
export type LeadQualification = "cold" | "warm" | "hot" | "mql";

/** Canal por el que entró el lead al CRM. */
export type LeadSource =
  | "website"
  | "whatsapp"
  | "facebook_ads"
  | "instagram_ads"
  | "referral"
  | "event"
  | "manual"
  | "organic"
  | "other";

/** Intención detectada (manualmente o por el agente IA futuro). */
export type LeadIntent =
  | "course_information"
  | "enroll_course"
  | "pricing"
  | "payment_help"
  | "group_access"
  | "support"
  | "schedule_call"
  | "course_recommendation"
  | "unknown";

/** Canal por el que se produjo una interacción con el lead. */
export type LeadInteractionChannel =
  | "whatsapp"
  | "email"
  | "call"
  | "form"
  | "internal_note"
  | "ai_suggestion"
  | "system";

/** Estado de una cita / seguimiento agendado. */
export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

/** Tipo de cita, para distinguir llamadas, sesiones, webinars, etc. */
export type AppointmentType =
  | "sales_call"
  | "advisory_call"
  | "demo_session"
  | "follow_up"
  | "webinar"
  | "live_class";

/* ------------------------------------------------------------------ */
/* Responsables de ventas                                              */
/* ------------------------------------------------------------------ */

export interface SalesOwner {
  id: string;
  name: string;
  email: string;
  /** Iniciales para avatar. */
  initials: string;
  /** Rol comercial (ventas, soporte, instructor). */
  role: "sales" | "support" | "instructor";
  /** Indica si está disponible para asignación de leads nuevos. */
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Lead                                                                */
/* ------------------------------------------------------------------ */

export interface Lead {
  id: string;
  /** Nombre para mostrar (puede ser solo nombre o nombre + apellido). */
  name: string;
  /** Email de contacto. */
  email: string;
  /**
   * Teléfono en formato internacional. En datos demo se usan placeholders
   * como +52XXXXXXXXXX. Nunca se inventan números reales.
   */
  phone?: string;
  /** Curso de interés (slug del catálogo o título libre). */
  courseOfInterest?: string;
  /** Etapa actual en el pipeline. */
  status: LeadStatus;
  /** Canal de origen. */
  source: LeadSource;
  /** Intención detectada. */
  intent: LeadIntent;
  /** Responsable de ventas asignado. */
  ownerId?: string;
  /** Etiquetas libres para segmentación. */
  tags?: string[];
  /** Fecha de creación (ISO). */
  createdAt: string;
  /** Última actualización (ISO). */
  updatedAt: string;
  /** Próximo seguimiento agendado (ISO), si lo hay. */
  nextFollowUpAt?: string;
  /** Consentimiento explícito para ser contactado (WhatsApp/llamada/email). */
  consentToContact: boolean;
  /** Valor estimado del lead en MXN (potencial de venta). */
  estimatedValueMXN?: number;
  /** Nota corta visible en el card del pipeline. */
  summary?: string;
  /**
   * Estado del flujo de WhatsApp manual (Bloque 2 de Fase 4).
   * Default: "no_contactado". Cambia con `markWhatsAppStatus`.
   */
  whatsappStatus?: "no_contactado" | "contactado" | "interested" | "lost";
  /** Timestamp del ultimo contacto por WhatsApp. */
  lastContactedAt?: string;
  /**
   * Score 0-100 derivado de la encuesta post-evento.
   * NULL hasta que el lead contesta la encuesta. Actualizado por
   * `lib/crm/lead-scoring.ts` cuando `surveys-server.ts` persiste
   * una nueva respuesta.
   */
  score?: number;
  /** Bucketed score. Se setea junto con `score`. */
  qualification?: LeadQualification;
  /** Timestamp del ultimo survey offer que mando el bot. Anti-spam. */
  surveyOfferSentAt?: string;
  /**
   * FIX 2026-07-08 (sesión madrugada): si true, el bot NO procesa
   * nuevos mensajes de este lead. El admin (David) activa este flag
   * cuando toma control manual de la conversación desde el panel CRM
   * (LeadDetailDrawer). El inbound igual se persiste (con metadata
   * `bot_paused_skip: true`) para que David vea el historial.
   *
   * Safe default: false. Migration: 20260708010000_leads_bot_paused.sql.
   */
  botPaused?: boolean;
  /** Timestamp del último toggle a true. */
  botPausedAt?: string | null;
  /** Email del admin que pausó (audit). */
  botPausedByEmail?: string | null;
  /**
   * Sprint v15 PR #1: razón de la pausa (keyword_escalation / ai_semantic_escalation / manual).
   * `null` cuando bot_paused = false. Migration: 20260711140000_bot_control_tower_v15.sql.
   */
  botPausedReason?: BotPauseReason | null;
}

/* ------------------------------------------------------------------ */
/* Interacciones y notas                                               */
/* ------------------------------------------------------------------ */

export interface LeadInteraction {
  id: string;
  leadId: string;
  channel: LeadInteractionChannel;
  /** Dirección del contacto (entrante del lead o saliente del equipo). */
  direction: "inbound" | "outbound";
  /** Resumen o contenido de la interacción. */
  content: string;
  /** Autor (nombre del responsable, "Sistema" o "Agente IA"). */
  author?: string;
  /** Fecha (ISO). */
  at: string;
}

export interface CRMNote {
  id: string;
  leadId: string;
  body: string;
  author: string;
  createdAt: string;
  /** Si la nota está marcada como importante. */
  pinned?: boolean;
}

export interface CRMTask {
  id: string;
  leadId?: string;
  title: string;
  description?: string;
  /** A quién corresponde la tarea. */
  ownerId?: string;
  dueAt: string;
  done: boolean;
  createdAt: string;
  /** Tipo de tarea para priorizar. */
  type: "call" | "whatsapp" | "email" | "meeting" | "follow_up" | "internal";
}

/* ------------------------------------------------------------------ */
/* Conversaciones (canal WhatsApp, modo demo)                          */
/* ------------------------------------------------------------------ */

export type ConversationStatus = "open" | "waiting_reply" | "resolved" | "escalated";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  /** Texto del mensaje. Si está vacío y hay `messageType`, la UI puede
   *  renderizar un placeholder contextual (ej. "📷 Imagen" si type=image). */
  body: string;
  /** Tipo de mensaje (alineado con `lead_whatsapp_conversations.message_type`).
   *  FIX 2026-07-07: agregado para que el CRM pueda mostrar placeholders
   *  cuando body viene vacío (imagen sin caption, audio, etc.). */
  messageType?: string;
  /** Autor (nombre del lead o del responsable). */
  author?: string;
  /** Si el mensaje fue sugerido por el agente IA (no enviado por API real). */
  aiSuggested?: boolean;
  at: string;
}

export interface Conversation {
  id: string;
  leadId: string;
  /** Canal de la conversación. Hoy solo "whatsapp" (manual wa.me). */
  channel: "whatsapp" | "email" | "internal";
  status: ConversationStatus;
  /** Resumen corto (generado o manual). */
  summary?: string;
  /** Última actualización (ISO). */
  updatedAt: string;
  messages: ConversationMessage[];
}

/* ------------------------------------------------------------------ */
/* Citas / calendario                                                  */
/* ------------------------------------------------------------------ */

/**
 * Cita o evento del calendario comercial. En la fase demo no se conecta a
 * Google Calendar; los tipos ya quedan listos para integración futura.
 */
export interface Appointment {
  id: string;
  leadId?: string;
  title: string;
  description?: string;
  type: AppointmentType;
  status: AppointmentStatus;
  /** Inicio (ISO). */
  startsAt: string;
  /** Duración en minutos. */
  durationMinutes: number;
  /** Modalidad. */
  mode: "phone" | "video" | "in_person";
  /** Enlace de la videollamada (placeholder en demo). */
  meetingUrl?: string;
  ownerId?: string;
  /** ID externo para sincronizar con Google Calendar en el futuro. */
  externalCalendarId?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Agente IA                                                           */
/* ------------------------------------------------------------------ */

export interface AIAgentProfile {
  /** Nombre visible del agente. */
  name: string;
  businessName: string;
  businessDescription: string;
  /** Cursos/servicios que el agente "conoce" para recomendar. */
  servicesOrCourses: string[];
  /** Horario de atención (texto libre o rangos). */
  businessHours: string;
  /** Tono de respuesta. */
  tone: "friendly" | "professional" | "formal";
  /** Reglas para escalar a humano. */
  escalationRules: string[];
  /** Acciones que el agente puede sugerir. */
  allowedActions: string[];
  /** Acciones que el agente nunca puede ejecutar ni prometer. */
  forbiddenActions: string[];
  /** Mensaje de respaldo cuando el agente no sabe responder. */
  fallbackMessage: string;
}

export type AISuggestionType =
  | "classify_intent"
  | "suggest_reply"
  | "summarize_conversation"
  | "detect_urgency"
  | "detect_payment_pending"
  | "recommend_course"
  | "escalate_to_human";

export interface AIAgentSuggestion {
  id: string;
  leadId: string;
  conversationId?: string;
  type: AISuggestionType;
  /** Texto sugerido por el agente (mock). */
  content: string;
  /** Confianza simulada 0–1. */
  confidence: number;
  /** Si requiere revisión humana antes de actuar. */
  needsReview: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Configuración de proveedores de WhatsApp                            */
/* ------------------------------------------------------------------ */

export type WhatsAppProviderName = "manual_wa" | "meta_cloud_api" | "bsp";

export interface WhatsAppProviderConfig {
  name: WhatsAppProviderName;
  displayName: string;
  /** Si el proveedor está activo en el MVP. */
  active: boolean;
  /** Si es un stub documentado (no implementado). */
  stub: boolean;
  /** Qué falta para activarlo. */
  requirements: string[];
  /** Notas de coexistencia con WhatsApp Business App. */
  coexistenceNotes?: string;
}

/* ------------------------------------------------------------------ */
/* Métricas / resumen                                                  */
/* ------------------------------------------------------------------ */

export interface CRMOverview {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  paymentPending: number;
  enrolled: number;
  activeStudents: number;
  /** Tasa de conversión simulada (0–100). */
  conversionRate: number;
  overdueFollowUps: number;
  upcomingAppointments: number;
}

export interface PipelineStage {
  status: LeadStatus;
  label: string;
  /** Orden de izquierda a derecha en el pipeline. */
  order: number;
  /** Color/tono para la UI. */
  tone: "brand" | "accent" | "neutral" | "success" | "warning" | "danger" | "info";
  leads: Lead[];
}
