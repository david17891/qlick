/**
 * Datos mock del CRM + WhatsApp AI Agent de Qlick.
 *
 * TODO ES FICTICIO. No se usan datos reales de clientes.
 * - Nombres inventados.
 * - Teléfonos en formato placeholder (+52XXXXXXXXXX) cuando se incluyen.
 * - Emails con dominio @example.com para evitar colisión con cuentas reales.
 *
 * En la fase demo estos datos se leen en memoria. Cuando se migre a Supabase,
 * los servicios de `src/lib/crm/*` conservan su firma y solo cambian estas
 * constantes por queries a Postgres.
 *
 * Las fechas se construyen sobre una base fija (BASE_DATE) para que el build
 * sea determinista y los estados "vencido/próximo" no dependan del reloj.
 */

import type {
  Lead,
  SalesOwner,
  LeadInteraction,
  CRMNote,
  CRMTask,
  Conversation,
  Appointment,
  AIAgentProfile,
  AIAgentSuggestion,
  WhatsAppProviderConfig
} from "@/types";

/**
 * Fecha base del dataset demo. Es la fecha de cierre del handoff del MVP
 * (ver docs/CRM_IMPLEMENTATION_REPORT.md). Todos los ISO se calculan a partir
 * de ella para que "hace X días" y "en Y días" sean estables en el build.
 */
const BASE_DATE = new Date("2026-06-23T10:00:00-06:00");

function iso(daysOffset: number, hour = 10, minute = 0): string {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/* ================================================================== */
/* Responsables de ventas                                              */
/* ================================================================== */

export const salesOwners: SalesOwner[] = [
  {
    id: "owner_mariana",
    name: "Mariana López",
    email: "mariana@example.com",
    initials: "ML",
    role: "sales",
    active: true
  },
  {
    id: "owner_roberto",
    name: "Roberto Méndez",
    email: "roberto@example.com",
    initials: "RM",
    role: "sales",
    active: true
  },
  {
    id: "owner_daniela",
    name: "Daniela Ruiz",
    email: "daniela@example.com",
    initials: "DR",
    role: "support",
    active: true
  }
];

/* ================================================================== */
/* Leads (15)                                                          */
/* ================================================================== */

export const leads: Lead[] = [
  {
    id: "lead_001",
    name: "Ana Torres",
    email: "ana.torres@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Fundamentos de Marketing Digital",
    status: "new",
    source: "website",
    intent: "course_information",
    ownerId: "owner_mariana",
    tags: ["web", "primer-contacto"],
    createdAt: iso(-2),
    updatedAt: iso(-2),
    nextFollowUpAt: iso(1),
    consentToContact: true,
    estimatedValueMXN: 0,
    summary: "Llegó por el formulario de contacto. Quiere saber por dónde empezar."
  },
  {
    id: "lead_002",
    name: "Carlos Vega",
    email: "carlos.vega@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Publicidad en Facebook e Instagram Ads",
    status: "new",
    source: "facebook_ads",
    intent: "pricing",
    ownerId: "owner_roberto",
    tags: ["ads", "precio"],
    createdAt: iso(-1),
    updatedAt: iso(-1),
    nextFollowUpAt: iso(2),
    consentToContact: true,
    estimatedValueMXN: 1499,
    summary: "Preguntó costo y forma de pago del curso de Ads."
  },
  {
    id: "lead_003",
    name: "Fernanda Cruz",
    email: "fer.cruz@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Automatización de Ventas con WhatsApp y CRM",
    status: "contacted",
    source: "instagram_ads",
    intent: "course_information",
    ownerId: "owner_mariana",
    tags: ["instagram", "automatizacion"],
    createdAt: iso(-6),
    updatedAt: iso(-3),
    nextFollowUpAt: iso(0),
    consentToContact: true,
    estimatedValueMXN: 1999,
    summary: "Ya le enviaron brochure. Confirma interés en automatización."
  },
  {
    id: "lead_004",
    name: "Jorge Castillo",
    email: "jorge.castillo@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Creación de Contenido para Redes Sociales",
    status: "interested",
    source: "referral",
    intent: "enroll_course",
    ownerId: "owner_roberto",
    tags: ["referido", "hot"],
    createdAt: iso(-9),
    updatedAt: iso(-2),
    nextFollowUpAt: iso(1),
    consentToContact: true,
    estimatedValueMXN: 1799,
    summary: "Lo refirió un alumno activo. Listo para inscribirse."
  },
  {
    id: "lead_005",
    name: "Lucía Ramírez",
    email: "lucia.ramirez@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Fundamentos de Marketing Digital",
    status: "info_requested",
    source: "whatsapp",
    intent: "course_recommendation",
    ownerId: "owner_mariana",
    tags: ["whatsapp", "recomendacion"],
    createdAt: iso(-5),
    updatedAt: iso(-1),
    nextFollowUpAt: iso(0),
    consentToContact: true,
    estimatedValueMXN: 0,
    summary: "Pide recomendación de curso según su nivel (principiante)."
  },
  {
    id: "lead_006",
    name: "Miguel Ángel Herrera",
    email: "miguel.herrera@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Publicidad en Facebook e Instagram Ads",
    status: "payment_pending",
    source: "website",
    intent: "payment_help",
    ownerId: "owner_roberto",
    tags: ["pago", "bloqueado"],
    createdAt: iso(-8),
    updatedAt: iso(-1),
    nextFollowUpAt: iso(0),
    consentToContact: true,
    estimatedValueMXN: 1499,
    summary: "Intentó pagar con tarjeta declinada. Necesita ayuda con OXXO/SPEI."
  },
  {
    id: "lead_007",
    name: "Paula Núñez",
    email: "paula.nunez@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Automatización de Ventas con WhatsApp y CRM",
    status: "payment_pending",
    source: "organic",
    intent: "payment_help",
    ownerId: "owner_mariana",
    tags: ["pago", "spei"],
    createdAt: iso(-7),
    updatedAt: iso(-2),
    nextFollowUpAt: iso(-1),
    consentToContact: true,
    estimatedValueMXN: 1999,
    summary: "Solicita datos para pagar por SPEI. Seguimiento vencido."
  },
  {
    id: "lead_008",
    name: "Sergio Pineda",
    email: "sergio.pineda@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Creación de Contenido para Redes Sociales",
    status: "enrolled",
    source: "instagram_ads",
    intent: "enroll_course",
    ownerId: "owner_roberto",
    tags: ["inscrito", "contenido"],
    createdAt: iso(-12),
    updatedAt: iso(-4),
    consentToContact: true,
    estimatedValueMXN: 1799,
    summary: "Inscrito hace 4 días. Pendiente de activar acceso."
  },
  {
    id: "lead_009",
    name: "Andrea Salazar",
    email: "andrea.salazar@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Fundamentos de Marketing Digital",
    status: "enrolled",
    source: "referral",
    intent: "enroll_course",
    ownerId: "owner_mariana",
    tags: ["inscrito", "gratuito"],
    createdAt: iso(-15),
    updatedAt: iso(-10),
    consentToContact: true,
    estimatedValueMXN: 0,
    summary: "Curso gratuito completado. Candidata a upsell."
  },
  {
    id: "lead_010",
    name: "Diego Fernández",
    email: "diego.fernandez@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Publicidad en Facebook e Instagram Ads",
    status: "active_student",
    source: "website",
    intent: "group_access",
    ownerId: "owner_daniela",
    tags: ["alumno", "grupo"],
    createdAt: iso(-20),
    updatedAt: iso(-3),
    consentToContact: true,
    estimatedValueMXN: 1499,
    summary: "Alumno activo. Pide acceso al grupo de WhatsApp."
  },
  {
    id: "lead_011",
    name: "Valeria Ortega",
    email: "valeria.ortega@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Automatización de Ventas con WhatsApp y CRM",
    status: "active_student",
    source: "event",
    intent: "support",
    ownerId: "owner_daniela",
    tags: ["alumno", "soporte"],
    createdAt: iso(-25),
    updatedAt: iso(-1),
    consentToContact: true,
    estimatedValueMXN: 1999,
    summary: "No puede abrir la lección 3 del módulo 2. Ticket de soporte."
  },
  {
    id: "lead_012",
    name: "Ricardo Domínguez",
    email: "ricardo.dominguez@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Creación de Contenido para Redes Sociales",
    status: "contacted",
    source: "manual",
    intent: "schedule_call",
    ownerId: "owner_roberto",
    tags: ["llamada", "demo"],
    createdAt: iso(-4),
    updatedAt: iso(-1),
    nextFollowUpAt: iso(1),
    consentToContact: true,
    estimatedValueMXN: 1799,
    summary: "Agendó llamada de asesoría para mañana."
  },
  {
    id: "lead_013",
    name: "Gabriela Mora",
    email: "gabriela.mora@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Fundamentos de Marketing Digital",
    status: "lost",
    source: "facebook_ads",
    intent: "pricing",
    ownerId: "owner_mariana",
    tags: ["perdido", "presupuesto"],
    createdAt: iso(-30),
    updatedAt: iso(-18),
    consentToContact: false,
    estimatedValueMXN: 0,
    summary: "No respondió tras 3 seguimientos. Lo dio por perdido."
  },
  {
    id: "lead_014",
    name: "Tomás Rivas",
    email: "tomas.rivas@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Publicidad en Facebook e Instagram Ads",
    status: "interested",
    source: "organic",
    intent: "schedule_call",
    ownerId: "owner_roberto",
    tags: ["hot", "llamada"],
    createdAt: iso(-3),
    updatedAt: iso(-1),
    nextFollowUpAt: iso(2),
    consentToContact: true,
    estimatedValueMXN: 1499,
    summary: "Quiere una llamada antes de decidir."
  },
  {
    id: "lead_015",
    name: "Renata Ávila",
    email: "renata.avila@example.com",
    phone: "+52XXXXXXXXXX",
    courseOfInterest: "Automatización de Ventas con WhatsApp y CRM",
    status: "archived",
    source: "other",
    intent: "unknown",
    ownerId: undefined,
    tags: ["archivado", "spam-posible"],
    createdAt: iso(-40),
    updatedAt: iso(-35),
    consentToContact: false,
    estimatedValueMXN: 0,
    summary: "Lead duplicado/archivado. Sin consentimiento claro."
  }
];

/* ================================================================== */
/* Interacciones                                                       */
/* ================================================================== */

export const leadInteractions: LeadInteraction[] = [
  {
    id: "int_003_a",
    leadId: "lead_003",
    channel: "whatsapp",
    direction: "inbound",
    content: "Hola, vi el anuncio de Instagram sobre el curso de WhatsApp y CRM.",
    author: "Fernanda Cruz",
    at: iso(-6)
  },
  {
    id: "int_003_b",
    leadId: "lead_003",
    channel: "whatsapp",
    direction: "outbound",
    content: "¡Hola Fernanda! Claro, te comparto el temario del curso.",
    author: "Mariana López",
    at: iso(-6, 11)
  },
  {
    id: "int_003_c",
    leadId: "lead_003",
    channel: "email",
    direction: "outbound",
    content: "Te envié el brochure en PDF. ¿Te lo llego a explicar por llamada?",
    author: "Mariana López",
    at: iso(-3)
  },
  {
    id: "int_006_a",
    leadId: "lead_006",
    channel: "whatsapp",
    direction: "inbound",
    content: "Mi tarjeta la rechazó el banco, ¿puedo pagar en OXXO?",
    author: "Miguel Ángel Herrera",
    at: iso(-1)
  },
  {
    id: "int_006_b",
    leadId: "lead_006",
    channel: "ai_suggestion",
    direction: "outbound",
    content: "Sugerencia IA: enviar instrucciones de pago OXXO/SPEI y reenviar link.",
    author: "Agente IA (demo)",
    at: iso(-1, 9)
  },
  {
    id: "int_011_a",
    leadId: "lead_011",
    channel: "whatsapp",
    direction: "inbound",
    content: "No me abre la lección 3 del módulo 2, me sale error.",
    author: "Valeria Ortega",
    at: iso(-1)
  },
  {
    id: "int_011_b",
    leadId: "lead_011",
    channel: "internal_note",
    direction: "outbound",
    content: "Escalado a soporte técnico. Posible problema de caché del navegador.",
    author: "Daniela Ruiz",
    at: iso(-1, 12)
  },
  {
    id: "int_007_a",
    leadId: "lead_007",
    channel: "whatsapp",
    direction: "outbound",
    content: "Hola Paula, te comparto los datos para SPEI.",
    author: "Mariana López",
    at: iso(-2)
  },
  {
    id: "int_004_a",
    leadId: "lead_004",
    channel: "call",
    direction: "outbound",
    content: "Llamada de 10 min. Confirmó que entra hoy al curso de Contenido.",
    author: "Roberto Méndez",
    at: iso(-2)
  }
];

/* ================================================================== */
/* Notas internas                                                      */
/* ================================================================== */

export const crmNotes: CRMNote[] = [
  {
    id: "note_004",
    leadId: "lead_004",
    body: "Referido por Andrea Salazar (alumni). Prioridad alta.",
    author: "Roberto Méndez",
    createdAt: iso(-9),
    pinned: true
  },
  {
    id: "note_006",
    leadId: "lead_006",
    body: "Cliente con buena intención pero sin tarjeta aprobada. Ofrecer OXXO.",
    author: "Roberto Méndez",
    createdAt: iso(-1)
  },
  {
    id: "note_013",
    leadId: "lead_013",
    body: "Dijo que el presupuesto no le alcanza este mes. Recontactar en 30 días.",
    author: "Mariana López",
    createdAt: iso(-18)
  }
];

/* ================================================================== */
/* Tareas                                                              */
/* ================================================================== */

export const crmTasks: CRMTask[] = [
  {
    id: "task_001",
    leadId: "lead_007",
    title: "Reenviar datos SPEI a Paula",
    description: "Confirmar si ya hizo la transferencia.",
    ownerId: "owner_mariana",
    dueAt: iso(-1),
    done: false,
    createdAt: iso(-2),
    type: "whatsapp"
  },
  {
    id: "task_002",
    leadId: "lead_006",
    title: "Enviar instrucciones de pago OXXO",
    ownerId: "owner_roberto",
    dueAt: iso(0),
    done: false,
    createdAt: iso(-1),
    type: "email"
  },
  {
    id: "task_003",
    leadId: "lead_012",
    title: "Llamada de asesoría con Ricardo",
    description: "Demo del curso de Contenido. Confirmar hora.",
    ownerId: "owner_roberto",
    dueAt: iso(1),
    done: false,
    createdAt: iso(-1),
    type: "call"
  },
  {
    id: "task_004",
    leadId: "lead_014",
    title: "Confirmar llamada con Tomás",
    ownerId: "owner_roberto",
    dueAt: iso(2),
    done: false,
    createdAt: iso(-1),
    type: "follow_up"
  },
  {
    id: "task_005",
    leadId: "lead_001",
    title: "Primer contacto con Ana",
    description: "Bienvenida y recomendación de curso inicial.",
    ownerId: "owner_mariana",
    dueAt: iso(1),
    done: false,
    createdAt: iso(-2),
    type: "whatsapp"
  },
  {
    id: "task_006",
    leadId: "lead_003",
    title: "Seguimiento Fernanda (automatización)",
    ownerId: "owner_mariana",
    dueAt: iso(0),
    done: false,
    createdAt: iso(-3),
    type: "follow_up"
  },
  {
    id: "task_007",
    leadId: "lead_008",
    title: "Activar acceso de Sergio",
    description: "Confirmar inscripción en la plataforma.",
    ownerId: "owner_roberto",
    dueAt: iso(-1),
    done: false,
    createdAt: iso(-4),
    type: "internal"
  },
  {
    id: "task_008",
    leadId: undefined,
    title: "Preparar webinar mensual",
    description: "Tema: embudo de conversión para principiantes.",
    ownerId: "owner_mariana",
    dueAt: iso(7),
    done: false,
    createdAt: iso(-1),
    type: "meeting"
  }
];

/* ================================================================== */
/* Conversaciones (canal WhatsApp, modo demo)                          */
/* ================================================================== */

export const conversations: Conversation[] = [
  {
    id: "conv_003",
    leadId: "lead_003",
    channel: "whatsapp",
    status: "waiting_reply",
    summary: "Fernanda pregunta por temario; se le envió brochure.",
    updatedAt: iso(-3),
    messages: [
      {
        id: "msg_003_1",
        conversationId: "conv_003",
        direction: "inbound",
        body: "Hola, vi el anuncio de Instagram sobre el curso de WhatsApp y CRM.",
        author: "Fernanda Cruz",
        at: iso(-6)
      },
      {
        id: "msg_003_2",
        conversationId: "conv_003",
        direction: "outbound",
        body: "¡Hola Fernanda! Claro, te comparto el temario del curso. ¿Qué objetivo tienes?",
        author: "Mariana López",
        at: iso(-6, 11)
      },
      {
        id: "msg_003_3",
        conversationId: "conv_003",
        direction: "inbound",
        body: "Tengo una tienda en línea y quiero automatizar respuestas.",
        author: "Fernanda Cruz",
        at: iso(-6, 11, 30)
      },
      {
        id: "msg_003_4",
        conversationId: "conv_003",
        direction: "outbound",
        body: "Perfecto, justo el curso cubre eso. Te envié el brochure a tu correo. ¿Lo revisamos por llamada?",
        author: "Mariana López",
        at: iso(-3)
      }
    ]
  },
  {
    id: "conv_006",
    leadId: "lead_006",
    channel: "whatsapp",
    status: "open",
    summary: "Miguel reporta pago rechazado; requiere instrucciones OXXO.",
    updatedAt: iso(-1),
    messages: [
      {
        id: "msg_006_1",
        conversationId: "conv_006",
        direction: "inbound",
        body: "Hola, intenté pagar pero mi tarjeta la rechazó el banco.",
        author: "Miguel Ángel Herrera",
        at: iso(-1, 9)
      },
      {
        id: "msg_006_2",
        conversationId: "conv_006",
        direction: "inbound",
        body: "¿Puedo pagar en OXXO o por transferencia?",
        author: "Miguel Ángel Herrera",
        at: iso(-1, 9, 5)
      },
      {
        id: "msg_006_3",
        conversationId: "conv_006",
        direction: "outbound",
        body: "Sugerencia IA: enviar instrucciones de pago OXXO/SPEI y reenviar link de checkout.",
        author: "Agente IA (demo)",
        aiSuggested: true,
        at: iso(-1, 9, 10)
      }
    ]
  },
  {
    id: "conv_011",
    leadId: "lead_011",
    channel: "whatsapp",
    status: "escalated",
    summary: "Valeria reporta error en lección; escalado a soporte técnico.",
    updatedAt: iso(-1),
    messages: [
      {
        id: "msg_011_1",
        conversationId: "conv_011",
        direction: "inbound",
        body: "No me abre la lección 3 del módulo 2, me sale error.",
        author: "Valeria Ortega",
        at: iso(-1, 10)
      },
      {
        id: "msg_011_2",
        conversationId: "conv_011",
        direction: "outbound",
        body: "Hola Valeria, lamento el problema. Lo derivamos con soporte técnico ahora mismo.",
        author: "Daniela Ruiz",
        at: iso(-1, 10, 15)
      }
    ]
  }
];

/* ================================================================== */
/* Citas / calendario                                                  */
/* ================================================================== */

export const appointments: Appointment[] = [
  {
    id: "appt_001",
    leadId: "lead_012",
    title: "Llamada de asesoría · Ricardo",
    description: "Demo del curso de Creación de Contenido.",
    type: "advisory_call",
    status: "scheduled",
    startsAt: iso(1, 11),
    durationMinutes: 30,
    mode: "phone",
    ownerId: "owner_roberto",
    createdAt: iso(-1)
  },
  {
    id: "appt_002",
    leadId: "lead_014",
    title: "Llamada comercial · Tomás",
    description: "Resolver dudas antes de decidir.",
    type: "sales_call",
    status: "scheduled",
    startsAt: iso(2, 16),
    durationMinutes: 20,
    mode: "video",
    meetingUrl: "https://meet.example.com/demo-qlick-placeholder",
    ownerId: "owner_roberto",
    createdAt: iso(-1)
  },
  {
    id: "appt_003",
    leadId: "lead_004",
    title: "Onboarding · Jorge",
    description: "Bienvenida al curso de Contenido.",
    type: "demo_session",
    status: "scheduled",
    startsAt: iso(3, 10),
    durationMinutes: 45,
    mode: "video",
    meetingUrl: "https://meet.example.com/onboarding-qlick-placeholder",
    ownerId: "owner_mariana",
    createdAt: iso(-2)
  },
  {
    id: "appt_004",
    leadId: undefined,
    title: "Webinar: embudo de conversión",
    description: "Webinar mensual abierto para leads nuevos.",
    type: "webinar",
    status: "scheduled",
    startsAt: iso(7, 18),
    durationMinutes: 60,
    mode: "video",
    meetingUrl: "https://meet.example.com/webinar-qlick-placeholder",
    ownerId: "owner_mariana",
    createdAt: iso(-1)
  },
  {
    id: "appt_005",
    leadId: "lead_009",
    title: "Sesión de seguimiento · Andrea",
    description: "Repaso de fundamentos y recomendación de siguiente curso.",
    type: "follow_up",
    status: "completed",
    startsAt: iso(-5, 11),
    durationMinutes: 30,
    mode: "phone",
    ownerId: "owner_mariana",
    createdAt: iso(-10)
  },
  {
    id: "appt_006",
    leadId: "lead_013",
    title: "Llamada · Gabriela (no asistió)",
    description: "Agendada pero no se presentó.",
    type: "sales_call",
    status: "no_show",
    startsAt: iso(-20, 12),
    durationMinutes: 20,
    mode: "phone",
    ownerId: "owner_mariana",
    createdAt: iso(-25)
  }
];

/* ================================================================== */
/* Perfil del agente IA (demo)                                         */
/* ================================================================== */

export const aiAgentProfile: AIAgentProfile = {
  name: "Qlick Asistente",
  businessName: "Qlick Marketing Digital",
  businessDescription:
    "Agencia de marketing y escuela de cursos digitales. Ayudamos a emprendedores y pymes a atraer, convertir y fidelizar clientes con marketing práctico.",
  servicesOrCourses: [
    "Fundamentos de Marketing Digital",
    "Publicidad en Facebook e Instagram Ads",
    "Automatización de Ventas con WhatsApp y CRM",
    "Creación de Contenido para Redes Sociales"
  ],
  businessHours: "Lun–Vie, 9:00–18:00 (GMT-6)",
  tone: "friendly",
  escalationRules: [
    "Pagos o reembolsos → derivar a ventas humanas.",
    "Quejas o molestias → derivar a responsable de cuenta.",
    "Soporte técnico de plataforma → derivar a soporte.",
    "Solicitudes de descuento no autorizado → derivar a ventas.",
    "Datos sensibles o jurídicos → nunca responder, derivar a humano."
  ],
  allowedActions: [
    "Clasificar intención del lead",
    "Sugerir respuestas para revisión humana",
    "Resumir conversaciones",
    "Recomendar curso según nivel",
    "Enviar mensaje de bienvenida plantilla"
  ],
  forbiddenActions: [
    "Confirmar pagos sin validación del sistema",
    "Crear accesos sin pago aprobado",
    "Ofrecer descuentos no autorizados",
    "Inventar precios, fechas o información",
    "Compartir datos de otros clientes"
  ],
  fallbackMessage:
    "Disculpá, no entendí bien tu mensaje. ¿Me lo podés reformular? Si necesitás atención personalizada escribinos a hola@qlick.marketing."
};

/* ================================================================== */
/* Sugerencias del agente IA (demo, mock)                              */
/* ================================================================== */

export const aiAgentSuggestions: AIAgentSuggestion[] = [
  {
    id: "sug_006_1",
    leadId: "lead_006",
    conversationId: "conv_006",
    type: "detect_payment_pending",
    content:
      "El lead reporta pago rechazado. Sugiere instrucciones OXXO/SPEI y reenvía link de checkout.",
    confidence: 0.92,
    needsReview: true,
    createdAt: iso(-1, 9, 10)
  },
  {
    id: "sug_006_2",
    leadId: "lead_006",
    conversationId: "conv_006",
    type: "suggest_reply",
    content:
      "Hola Miguel, lamento el inconveniente. Puedes pagar en OXXO con esta referencia o por SPEI a los datos que te adjunto. ¿Te los envío ahora?",
    confidence: 0.85,
    needsReview: true,
    createdAt: iso(-1, 9, 12)
  },
  {
    id: "sug_003_1",
    leadId: "lead_003",
    conversationId: "conv_003",
    type: "classify_intent",
    content: "Intención: automatización de respuestas para e-commerce → curso de WhatsApp y CRM.",
    confidence: 0.88,
    needsReview: false,
    createdAt: iso(-6, 11, 5)
  },
  {
    id: "sug_011_1",
    leadId: "lead_011",
    conversationId: "conv_011",
    type: "escalate_to_human",
    content: "Reporte de error técnico en lección. Escalar a soporte, no responder con solución genérica.",
    confidence: 0.95,
    needsReview: true,
    createdAt: iso(-1, 10, 2)
  },
  {
    id: "sug_005_1",
    leadId: "lead_005",
    type: "recommend_course",
    content: "Lead principiante sin curso previo → recomendar Fundamentos de Marketing Digital.",
    confidence: 0.8,
    needsReview: false,
    createdAt: iso(-5, 12)
  },
  {
    id: "sug_004_1",
    leadId: "lead_004",
    type: "detect_urgency",
    content: "Lead referido y caliente. Priorizar respuesta en menos de 2 h.",
    confidence: 0.9,
    needsReview: false,
    createdAt: iso(-2, 13)
  }
];

/* ================================================================== */
/* Configuración de proveedores de WhatsApp                            */
/* ================================================================== */

export const whatsappProviders: WhatsAppProviderConfig[] = [
  {
    name: "manual_wa",
    displayName: "WhatsApp manual (wa.me)",
    active: true,
    stub: false,
    requirements: [
      "Variables NEXT_PUBLIC_WHATSAPP_SALES_NUMBER / SUPPORT_NUMBER / GROUP_URL",
      "Click-to-chat: abre la app, no envía mensajes automatizados"
    ],
    coexistenceNotes:
      "Coexiste con cualquier línea porque solo abre el chat del cliente."
  },
  {
    name: "meta_cloud_api",
    displayName: "WhatsApp Business Platform / Cloud API",
    active: false,
    stub: true,
    requirements: [
      "App en Meta for Developers (WhatsApp Business)",
      "Phone Number ID y Token de acceso permanente",
      "Verificación del número y opt-in del cliente",
      "Plantillas (templates) aprobadas para envíos outbound",
      "Endpoint webhook público para recibir mensajes"
    ],
    coexistenceNotes:
      "Si el proveedor lo soporta, puede coexistir con la WhatsApp Business App migrando el número."
  },
  {
    name: "bsp",
    displayName: "Proveedor BSP (YCloud / 360dialog / similar)",
    active: false,
    stub: true,
    requirements: [
      "Cuenta en el BSP elegido",
      "API key del BSP",
      "Configuración de plantillas y webhook",
      "Decisión sobre qué BSP usar (fase futura)"
    ],
    coexistenceNotes:
      "Algunos BSP permiten coexistencia con la app de escritorio; depende del proveedor."
  }
];
