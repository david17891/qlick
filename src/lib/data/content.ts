import type { ActivityEvent, FaqItem, Testimonial } from "@/types";

/**
 * Prueba social simulada (testimonios), preguntas frecuentes y
 * actividad reciente para los dashboards.
 * TODO: reemplazar con testimonios reales cuando se recolecten.
 */

export const testimonials: Testimonial[] = [
  {
    id: "t_1",
    name: "Andrea Solís",
    role: "Dueña de boutique online",
    company: "Solís Moda",
    quote:
      "Antes gastaba en anuncios sin saber si funcionaban. Después del curso de Meta Ads mis ventas subieron 40% en dos meses y por fin entiendo qué hago.",
    rating: 5,
    courseSlug: "publicidad-facebook-instagram-ads"
  },
  {
    id: "t_2",
    name: "Ricardo Mendoza",
    role: "Freelance de automatización",
    quote:
      "El curso de WhatsApp y CRM me dio el sistema exacto que ahora le vendo a mis clientes. Recuperé la inversión la primera semana.",
    rating: 5,
    courseSlug: "automatizacion-ventas-whatsapp-crm"
  },
  {
    id: "t_3",
    name: "Paula Garza",
    role: "Community Manager",
    quote:
      "Pensaba que sabía de redes, pero el de contenido me hizo entender el porqué de cada post. Mis clientes lo notan y pagan mejor.",
    rating: 4,
    courseSlug: "creacion-contenido-redes-sociales"
  },
  {
    id: "t_4",
    name: "Martín Ríos",
    role: "Emprendedor",
    quote:
      "Empecé desde cero con el curso gratuito de Fundamentos. Hoy tengo mi plan de marketing y mis primeros clientes. Muy claro y práctico.",
    rating: 5,
    courseSlug: "fundamentos-marketing-digital"
  }
];

export const faqs: FaqItem[] = [
  {
    id: "faq_1",
    question: "¿Los cursos son en vivo o grabados?",
    answer:
      "Son 100% grabados para que aprendas a tu ritmo. Algunos cursos incluyen sesiones en vivo opcionales que se graban y quedan disponibles.",
    category: "cursos"
  },
  {
    id: "faq_2",
    question: "¿Por cuánto tiempo tengo acceso?",
    answer:
      "El acceso es indefinido mientras la plataforma esté activa. Puedes repasar las lecciones las veces que quieras, incluyendo futuras actualizaciones del curso.",
    category: "acceso"
  },
  {
    id: "faq_3",
    question: "¿Qué métodos de pago aceptan?",
    answer:
      "Aceptamos tarjeta, transferencia SPEI y pago en efectivo en OXXO. El pago es procesado de forma segura. En el MVP las transacciones son simuladas.",
    category: "pagos"
  },
  {
    id: "faq_4",
    question: "¿Puedo pagar en mensualidades?",
    answer:
      "Próximamente. Por ahora cada curso se paga por separado. Estamos preparando planes MSI (meses sin intereses) con proveedores mexicanos.",
    category: "pagos"
  },
  {
    id: "faq_5",
    question: "¿Recibo un certificado?",
    answer:
      "Sí. Al completar el 100% de las lecciones generas automáticamente un certificado digital con código de verificación.",
    category: "certificados"
  },
  {
    id: "faq_6",
    question: "¿Sirven para alguien sin experiencia?",
    answer:
      "Sí. Tenemos cursos básicos como Fundamentos de Marketing Digital diseñados para empezar desde cero.",
    category: "general"
  },
  {
    id: "faq_7",
    question: "¿Hay garantía de devolución?",
    answer:
      "Sí. Si en los primeros 7 días sientes que el curso no es para ti, te devolvemos el 100% sin preguntas.",
    category: "pagos"
  },
  {
    id: "faq_8",
    question: "¿Puedo facturar?",
    answer:
      "Sí. Al finalizar tu compra puedes solicitar factura con tus datos fiscales. La facturación electrónica (CFDI) se habilita en la Fase 2.",
    category: "pagos"
  }
];

export const activity: ActivityEvent[] = [
  {
    id: "act_1",
    userId: "user_alumno",
    type: "lesson_completed",
    message: "Completaste “Anatomía de un anuncio ganador” en Meta Ads.",
    courseId: "course_ads",
    lessonId: "les_ads_2_1",
    createdAt: "2025-06-15T11:20:00Z"
  },
  {
    id: "act_2",
    userId: "user_alumno",
    type: "course_completed",
    message: "¡Felicidades! Completaste Fundamentos de Marketing Digital.",
    courseId: "course_fundamentos",
    createdAt: "2025-05-12T10:00:00Z"
  },
  {
    id: "act_3",
    userId: "user_alumno",
    type: "purchase",
    message: "Compraste Publicidad en Facebook e Instagram Ads.",
    courseId: "course_ads",
    createdAt: "2025-05-20T11:00:00Z"
  },
  {
    id: "act_4",
    userId: "user_alumno",
    type: "login",
    message: "Iniciaste sesión.",
    createdAt: "2025-06-20T18:00:00Z"
  }
];

export function getActivityForUser(userId: string): ActivityEvent[] {
  return activity
    .filter((a) => a.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
