import type { Course } from "@/types";
import { getPublishedCourses as getPublishedCoursesServer } from "@/lib/lms/courses-server";
import { checkSupabaseConfig } from "@/lib/supabase/health";

/**
 * Catálogo de cursos demo.
 *
 * 4 cursos completos, cada uno con 3 módulos y 3 lecciones (mínimo exigido).
 * Los videos son IDs reales de YouTube (contenido libre/educativo de muestra)
 * marcados como demo. Ver docs/VIDEO_STRATEGY.md.
 *
 * Las miniaturas usan Unsplash (vía next/image con remotePattern configurado).
 * Reemplazar por imágenes reales en /public/courses cuando estén disponibles.
 *
 * LMS Real Foundation (v0.7.0): el server lib `@/lib/lms/courses-server`
 * expone la fuente de verdad de Supabase (`courses`, `modules`, `lessons`)
 * con fallback demo. Los accesores públicos de este archivo (`getAllCourses`,
 * `getCourseBySlug`, etc.) **siguen devolviendo la forma legacy** (Course con
 * módulos+lecciones embebidos) porque las páginas actuales (`/cursos`,
 * `/aprender`, etc.) dependen de esa forma rica.
 *
 * Para código nuevo que use la BD real directamente, importa desde
 * `@/lib/lms` — los tipos son distintos (`@/types/lms.Course` es flat y se
 * complementa con `getCourseModules` + `getModuleLessons`).
 */

const thumb = {
  fundamentos:
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
  ads: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=900&q=80",
  automatizacion:
    "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=900&q=80",
  contenido:
    "https://images.unsplash.com/photo-1542744095-fcf48d80b0fd?auto=format&fit=crop&w=900&q=80"
};

// VideoId de YouTube de ejemplo (contenido libre de muestra).
// AVISO: no listado / público no es protección real. Ver docs/VIDEO_STRATEGY.md.
const YT = (videoId: string) => ({
  provider: "youtube" as const,
  source: videoId
});

export const courses: Course[] = [
  /* ---------------------------- 1. Fundamentos ---------------------------- */
  {
    id: "course_fundamentos",
    slug: "fundamentos-marketing-digital",
    title: "Fundamentos de Marketing Digital",
    shortDescription:
      "Domina los pilares del marketing digital: embudo, audiencias, canales y medición. El punto de partida para cualquier estrategia.",
    longDescription:
      "Este curso te lleva desde cero hasta entender cómo funciona una estrategia de marketing digital completa. Aprenderás a pensar como un estratega: qué canal usar, para quién, con qué mensaje y cómo medir si funcionó. Está diseñado para emprendedores, dueños de pyme y profesionales que quieren dejar de improvisar y empezar a tomar decisiones con datos. Al terminar tendrás un plan de marketing aplicable a tu negocio.",
    thumbnailUrl: thumb.fundamentos,
    heroImageUrl: thumb.fundamentos,
    level: "basico",
    estimatedHours: 6,
    instructorId: "inst_emilio",
    priceMXN: 0,
    status: "gratis",
    tags: [
      { id: "t_estrategia", label: "Estrategia" },
      { id: "t_principiantes", label: "Principiantes" },
      { id: "t_embudo", label: "Embudo" }
    ],
    whatYouWillLearn: [
      "Entender el embudo de marketing (ATRAER → CONVERTIR → FIDELIZAR) y aplicarlo a tu negocio.",
      "Elegir los canales correctos según tu audiencia y presupuesto.",
      "Definir a tu buyer persona y tu propuesta de valor.",
      "Leer métricas clave (CTR, CPL, ROAS) sin abrumarte.",
      "Construir un plan de marketing de 90 días."
    ],
    requirements: [
      "Ganas de aprender. No necesitas experiencia previa en marketing.",
      "Acceso a internet y un cuaderno para tu plan."
    ],
    targetAudience: [
      "Emprendedores y dueños de pyme sin formación en marketing.",
      "Profesionales que migran al mundo digital.",
      "Community managers que quieren entender el panorama completo."
    ],
    featured: true,
    rating: 4.8,
    studentsCount: 1240,
    createdAt: "2025-02-01T00:00:00Z",
    modules: [
      {
        id: "mod_fund_1",
        slug: "modulo-1-mentalidad-estrategica",
        title: "Módulo 1 · Mentalidad estratégica",
        description: "Cómo piensa un estratega de marketing antes de tocar una sola herramienta.",
        order: 1,
        lessons: [
          {
            id: "les_fund_1_1",
            slug: "que-es-marketing-digital-hoy",
            title: "¿Qué es el marketing digital hoy?",
            description: "Desmitificamos el marketing digital y lo conectamos con resultados de negocio.",
            type: "video",
            video: { id: "vid_fund_1_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 480, unlisted: false },
            durationMinutes: 12,
            resources: [
              { id: "res_fund_1_1", title: "Glosario de marketing digital (PDF)", type: "pdf", url: "#" }
            ],
            isPreview: true,
            order: 1
          },
          {
            id: "les_fund_1_2",
            slug: "el-embudo-de-conversion",
            title: "El embudo de conversión explicado simple",
            description: "ATRAER, CONVERTIR, FIDELIZAR. Cómo encaja cada canal en cada etapa.",
            type: "video",
            video: { id: "vid_fund_1_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 540 },
            durationMinutes: 14,
            resources: [],
            order: 2
          },
          {
            id: "les_fund_1_3",
            slug: "buyer-persona-y-propuesta-de-valor",
            title: "Buyer persona y propuesta de valor",
            description: "Ejercicio guiado para definir a quién le hablas y por qué debería elegirte.",
            type: "exercise",
            video: { id: "vid_fund_1_3", ...YT("dQw4w9WgXcQ"), durationSeconds: 600 },
            durationMinutes: 16,
            resources: [
              { id: "res_fund_1_3", title: "Plantilla buyer persona (PDF)", type: "template", url: "#" }
            ],
            order: 3
          }
        ]
      },
      {
        id: "mod_fund_2",
        slug: "modulo-2-canales-y-mensajes",
        title: "Módulo 2 · Canales y mensajes",
        description: "Qué canal usar, cuándo y con qué tipo de contenido.",
        order: 2,
        lessons: [
          {
            id: "les_fund_2_1",
            slug: "mapa-de-canales",
            title: "Mapa de canales: orgánico vs. pagado",
            description: "Comparativa honesta de redes, email, SEO y anuncios.",
            type: "video",
            video: { id: "vid_fund_2_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 520 },
            durationMinutes: 13,
            resources: [],
            order: 1
          },
          {
            id: "les_fund_2_2",
            slug: "mensaje-que-conecta",
            title: "Cómo escribir un mensaje que conecte",
            description: "Fórmulas prácticas de copywriting aplicado a redes y anuncios.",
            type: "video",
            video: { id: "vid_fund_2_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 500 },
            durationMinutes: 12,
            resources: [],
            order: 2
          },
          {
            id: "les_fund_2_3",
            slug: "calendario-de-contenido",
            title: "Tu primer calendario de contenido",
            description: "Armamos un calendario real para 4 semanas.",
            type: "exercise",
            durationMinutes: 15,
            resources: [
              { id: "res_fund_2_3", title: "Calendario editable (Sheets)", type: "template", url: "#" }
            ],
            order: 3
          }
        ]
      },
      {
        id: "mod_fund_3",
        slug: "modulo-3-medicion-y-plan",
        title: "Módulo 3 · Medición y plan de 90 días",
        description: "Métricas que importan y cómo aterrizar tu plan.",
        order: 3,
        lessons: [
          {
            id: "les_fund_3_1",
            slug: "metricas-que-importan",
            title: "Las 5 métricas que de verdad importan",
            description: "CTR, CPL, ROAS, CAC y LTV explicados sin tecnicismos.",
            type: "video",
            video: { id: "vid_fund_3_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 560 },
            durationMinutes: 14,
            resources: [],
            order: 1
          },
          {
            id: "les_fund_3_2",
            slug: "herramientas-gratuitas",
            title: "Herramientas gratuitas para empezar",
            description: "GA4, Meta Business, Looker Studio y otras utilidades.",
            type: "reading",
            durationMinutes: 10,
            content: "Lista curada de herramientas gratuitas para analítica, diseño y programación.",
            resources: [],
            order: 2
          },
          {
            id: "les_fund_3_3",
            slug: "plan-90-dias",
            title: "Construye tu plan de 90 días",
            description: "Lección final con entregable: tu plan accionable.",
            type: "exercise",
            durationMinutes: 18,
            resources: [
              { id: "res_fund_3_3", title: "Plantilla plan 90 días (PDF)", type: "template", url: "#" }
            ],
            order: 3
          }
        ]
      }
    ]
  },

  /* ---------------------------- 2. Meta Ads ---------------------------- */
  {
    id: "course_ads",
    slug: "publicidad-facebook-instagram-ads",
    title: "Publicidad en Facebook e Instagram Ads",
    shortDescription:
      "Crea, lanza y optimiza campañas rentables en Meta Ads. Del píxel al escalamiento.",
    longDescription:
      "Aprende a generar ventas reales con Facebook e Instagram Ads. Este curso cubre todo el flujo profesional: configuración del píxel, segmentación, creatividades, presupuestos, optimización y escalamiento. Está pensado para que pagues el curso con tu primera campaña rentable. Incluye plantillas y ejemplos reales del mercado mexicano.",
    thumbnailUrl: thumb.ads,
    heroImageUrl: thumb.ads,
    level: "intermedio",
    estimatedHours: 9,
    instructorId: "inst_sofia",
    priceMXN: 1499,
    originalPriceMXN: 2499,
    status: "pago",
    tags: [
      { id: "t_ads", label: "Meta Ads" },
      { id: "t_performance", label: "Performance" },
      { id: "t_conversion", label: "Conversión" }
    ],
    whatYouWillLearn: [
      "Configurar el Píxel de Meta y los eventos que importan.",
      "Estructurar campañas por objetivo (alcance, tráfico, conversión).",
      "Diseñar creatividades que detengan el scroll.",
      "Optimizar campañas en base a datos, no intuición.",
      "Escalar presupuestos sin romper el ROAS."
    ],
    requirements: [
      "Conocimientos básicos de marketing digital (o haber tomado el curso de Fundamentos).",
      "Una página web o landing a donde enviar el tráfico.",
      "Presupuesto mínimo recomendado de prueba: $100 MXN/día."
    ],
    targetAudience: [
      "Dueños de negocio que quieren vender más con anuncios.",
      "Community managers que dan el salto a performance.",
      "Freelancers que ofrecen publicidad como servicio."
    ],
    featured: true,
    rating: 4.9,
    studentsCount: 642,
    createdAt: "2025-03-12T00:00:00Z",
    modules: [
      {
        id: "mod_ads_1",
        slug: "modulo-1-configuracion",
        title: "Módulo 1 · Configuración profesional",
        description: "Todo lo que debe estar bien antes de gastar un peso.",
        order: 1,
        lessons: [
          {
            id: "les_ads_1_1",
            slug: "business-manager-y-pixel",
            title: "Business Manager y Píxel de Meta",
            description: "Instalación del píxel y verificación de eventos.",
            type: "video",
            video: { id: "vid_ads_1_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 720 },
            durationMinutes: 18,
            resources: [],
            isPreview: true,
            order: 1
          },
          {
            id: "les_ads_1_2",
            slug: "eventos-y-conversion-api",
            title: "Eventos clave y Conversions API",
            description: "Qué eventos rastrear y por qué importa la CAPI post-iOS 14.",
            type: "video",
            video: { id: "vid_ads_1_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 660 },
            durationMinutes: 16,
            resources: [],
            order: 2
          },
          {
            id: "les_ads_1_3",
            slug: "audiences-y-lookalikes",
            title: "Audiencias, custom y lookalike",
            description: "Cómo construir audiencias que de verdad convierten.",
            type: "video",
            video: { id: "vid_ads_1_3", ...YT("dQw4w9WgXcQ"), durationSeconds: 600 },
            durationMinutes: 15,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_ads_2",
        slug: "modulo-2-creatividad",
        title: "Módulo 2 · Creatividad que convierte",
        description: "Anuncios que detienen el scroll y generan clics de calidad.",
        order: 2,
        lessons: [
          {
            id: "les_ads_2_1",
            slug: "anatomia-de-un-anuncio",
            title: "Anatomía de un anuncio ganador",
            description: "Visual, copy, gancho y llamada a la acción.",
            type: "video",
            video: { id: "vid_ads_2_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 580 },
            durationMinutes: 14,
            resources: [],
            order: 1
          },
          {
            id: "les_ads_2_2",
            slug: "formatos-y-pruebas",
            title: "Formatos y pruebas A/B",
            description: "Reels, carruseles e imágenes. Qué probar primero.",
            type: "video",
            video: { id: "vid_ads_2_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 620 },
            durationMinutes: 15,
            resources: [],
            order: 2
          },
          {
            id: "les_ads_2_3",
            slug: "library-y-benchmark",
            title: "Espionaje ético con Ad Library",
            description: "Cómo investigar a tu competencia sin copiar.",
            type: "exercise",
            durationMinutes: 12,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_ads_3",
        slug: "modulo-3-optimizacion-y-escalamiento",
        title: "Módulo 3 · Optimización y escalamiento",
        description: "De campaña aprendiendo a campaña rentable.",
        order: 3,
        lessons: [
          {
            id: "les_ads_3_1",
            slug: "lectura-de-metricas",
            title: "Leer métricas como un pro",
            description: "Interpretar Result, Coste, ROAS y frecuencia.",
            type: "video",
            video: { id: "vid_ads_3_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 640 },
            durationMinutes: 16,
            resources: [],
            order: 1
          },
          {
            id: "les_ads_3_2",
            slug: "escalamiento-vertical-horizontal",
            title: "Escalamiento vertical y horizontal",
            description: "Cómo subir presupuesto sin matar la campaña.",
            type: "video",
            video: { id: "vid_ads_3_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 580 },
            durationMinutes: 14,
            resources: [],
            order: 2
          },
          {
            id: "les_ads_3_3",
            slug: "retargeting-y-fidelizacion",
            title: "Retargeting y fidelización",
            description: "Vuelve a conectar con quienes no compraron la primera vez.",
            type: "exercise",
            durationMinutes: 15,
            resources: [],
            order: 3
          }
        ]
      }
    ]
  },

  /* ---------------------------- 3. Automatización ---------------------------- */
  {
    id: "course_automatizacion",
    slug: "automatizacion-ventas-whatsapp-crm",
    title: "Automatización de Ventas con WhatsApp y CRM",
    shortDescription:
      "Convierte conversaciones de WhatsApp en ventas automáticas con un CRM bien montado.",
    longDescription:
      "En México, WhatsApp es el canal #1 de ventas. Este curso te enseña a construir un sistema de ventas que responde, califica y da seguimiento por ti. Cubrimos WhatsApp Business, plantillas, chatbots sin código, integración con CRM y automatizaciones que ahorran horas a la semana. Saldrás con un flujo funcional que puedes conectar a tu negocio real.",
    thumbnailUrl: thumb.automatizacion,
    heroImageUrl: thumb.automatizacion,
    level: "intermedio",
    estimatedHours: 8,
    instructorId: "inst_andres",
    priceMXN: 1799,
    originalPriceMXN: 2299,
    status: "pago",
    tags: [
      { id: "t_whatsapp", label: "WhatsApp" },
      { id: "t_crm", label: "CRM" },
      { id: "t_automatizacion", label: "Automatización" }
    ],
    whatYouWillLearn: [
      "Configurar WhatsApp Business API y plantillas oficiales.",
      "Diseñar un árbol de conversación que califica leads.",
      "Integrar WhatsApp con un CRM (HubSpot / Zoho / similar).",
      "Automatizar seguimientos y recordatorios sin perder el toque humano.",
      "Medir qué conversiones vienen de WhatsApp."
    ],
    requirements: [
      "WhatsApp Business instalado.",
      "Conocimientos básicos de ventas (no técnicos)."
    ],
    targetAudience: [
      "Equipos comerciales de pymes mexicanas.",
      "Vendedores que pierden leads por mala gestión.",
      "Agencias que quieren ofrecer automatización como servicio."
    ],
    featured: false,
    rating: 4.7,
    studentsCount: 318,
    createdAt: "2025-04-05T00:00:00Z",
    modules: [
      {
        id: "mod_auto_1",
        slug: "modulo-1-fundamentos-whatsapp",
        title: "Módulo 1 · Fundamentos de WhatsApp Business",
        description: "Lo que necesitas bien configurado antes de automatizar.",
        order: 1,
        lessons: [
          {
            id: "les_auto_1_1",
            slug: "whatsapp-business-vs-api",
            title: "WhatsApp Business vs. WhatsApp API",
            description: "Cuál te conviene según tu volumen.",
            type: "video",
            video: { id: "vid_auto_1_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 540 },
            durationMinutes: 13,
            resources: [],
            isPreview: true,
            order: 1
          },
          {
            id: "les_auto_1_2",
            slug: "catalogo-y-perfil",
            title: "Catálogo y perfil optimizado",
            description: "Convierte tu perfil en una vitrina de ventas.",
            type: "video",
            video: { id: "vid_auto_1_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 480 },
            durationMinutes: 12,
            resources: [],
            order: 2
          },
          {
            id: "les_auto_1_3",
            slug: "plantillas-oficiales",
            title: "Plantillas oficiales (HSM)",
            description: "Cómo redactar plantillas que Meta aprueba.",
            type: "exercise",
            durationMinutes: 14,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_auto_2",
        slug: "modulo-2-chatbots-sin-codigo",
        title: "Módulo 2 · Chatbots sin código",
        description: "Construye árboles de conversación que califican leads.",
        order: 2,
        lessons: [
          {
            id: "les_auto_2_1",
            slug: "mapa-de-conversacion",
            title: "Diseña el mapa de conversación",
            description: "Estructura para no abrumar al cliente.",
            type: "video",
            video: { id: "vid_auto_2_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 560 },
            durationMinutes: 14,
            resources: [],
            order: 1
          },
          {
            id: "les_auto_2_2",
            slug: "herramientas-no-code",
            title: "Herramientas no-code para chatbots",
            description: "Comparativa y setup de la opción recomendada.",
            type: "video",
            video: { id: "vid_auto_2_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 600 },
            durationMinutes: 15,
            resources: [],
            order: 2
          },
          {
            id: "les_auto_2_3",
            slug: "bot-qualifier",
            title: "Construye tu bot calificador",
            description: "Lección práctica: armamos un bot de 3 preguntas.",
            type: "exercise",
            durationMinutes: 16,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_auto_3",
        slug: "modulo-3-crm-y-automaticos",
        title: "Módulo 3 · CRM y automatizaciones",
        description: "Conecta todo y deja que el sistema trabaje por ti.",
        order: 3,
        lessons: [
          {
            id: "les_auto_3_1",
            slug: "conexion-con-crm",
            title: "Conexión con tu CRM",
            description: "Integración paso a paso.",
            type: "video",
            video: { id: "vid_auto_3_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 660 },
            durationMinutes: 16,
            resources: [],
            order: 1
          },
          {
            id: "les_auto_3_2",
            slug: "automaticos-de-seguimiento",
            title: "Automáticos de seguimiento",
            description: "Recordatorios y recuperación de carrito.",
            type: "video",
            video: { id: "vid_auto_3_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 580 },
            durationMinutes: 14,
            resources: [],
            order: 2
          },
          {
            id: "les_auto_3_3",
            slug: "metricas-de-conversacion",
            title: "Mide las conversiones de WhatsApp",
            description: "Dashboard básico y optimización.",
            type: "exercise",
            durationMinutes: 13,
            resources: [],
            order: 3
          }
        ]
      }
    ]
  },

  /* ---------------------------- 4. Contenido ---------------------------- */
  {
    id: "course_contenido",
    slug: "creacion-contenido-redes-sociales",
    title: "Creación de Contenido para Redes Sociales",
    shortDescription:
      "Produce contenido que se comparte, convierte y construye marca. Del planning al reel.",
    longDescription:
      "Contenido que se ve bonito no es lo mismo que contenido que vende. Aquí aprenderás a planear, producir y publicar contenido con propósito. Trabajamos formato corto (Reels/TikTok), carruseles y stories, con un sistema que puedes sostener en el tiempo aunque tengas poco equipo. Incluye frameworks de ideas, plantillas de edición y métricas de contenido.",
    thumbnailUrl: thumb.contenido,
    heroImageUrl: thumb.contenido,
    level: "basico",
    estimatedHours: 7,
    instructorId: "inst_luisa",
    priceMXN: 1299,
    status: "pago",
    tags: [
      { id: "t_contenido", label: "Contenido" },
      { id: "t_reels", label: "Reels" },
      { id: "t_branding", label: "Branding" }
    ],
    whatYouWillLearn: [
      "Generar ideas de contenido que sí le interesan a tu audiencia.",
      "Producir Reels con estructura, ritmo y gancho.",
      "Editar rápido con herramientas accesibles (CapCut, Canva).",
      "Construir un banco de contenido para 30 días.",
      "Medir qué contenido impulsa seguidores y ventas."
    ],
    requirements: [
      "Celular con cámara decente.",
      "Apps gratuitas de edición (CapCut y Canva)."
    ],
    targetAudience: [
      "Community managers y creadores.",
      "Dueños de marca personal o de pyme.",
      "Cualquiera que quiera crecer en redes con sistema, no con suerte."
    ],
    featured: false,
    rating: 4.6,
    studentsCount: 489,
    createdAt: "2025-05-01T00:00:00Z",
    modules: [
      {
        id: "mod_con_1",
        slug: "modulo-1-estrategia-de-contenido",
        title: "Módulo 1 · Estrategia de contenido",
        description: "Antes de grabar, piensa. Aquí diseñamos el sistema.",
        order: 1,
        lessons: [
          {
            id: "les_con_1_1",
            slug: "pilares-de-contenido",
            title: "Define tus pilares de contenido",
            description: "3 a 5 temas que sostienen toda tu marca.",
            type: "video",
            video: { id: "vid_con_1_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 500 },
            durationMinutes: 12,
            resources: [],
            isPreview: true,
            order: 1
          },
          {
            id: "les_con_1_2",
            slug: "banco-de-ideas",
            title: "Construye un banco de ideas infinitas",
            description: "Método para nunca más quedarte sin ideas.",
            type: "video",
            video: { id: "vid_con_1_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 540 },
            durationMinutes: 13,
            resources: [],
            order: 2
          },
          {
            id: "les_con_1_3",
            slug: "calendario-30-dias",
            title: "Calendario editorial de 30 días",
            description: "Práctica: arma tu mes de contenido.",
            type: "exercise",
            durationMinutes: 14,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_con_2",
        slug: "modulo-2-produccion",
        title: "Módulo 2 · Producción (Reels y carruseles)",
        description: "Cómo grabar y armar piezas que detienen el scroll.",
        order: 2,
        lessons: [
          {
            id: "les_con_2_1",
            slug: "guion-de-reel",
            title: "Guion de Reel que engancha",
            description: "Estructura de 3 segundos para ganar atención.",
            type: "video",
            video: { id: "vid_con_2_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 520 },
            durationMinutes: 13,
            resources: [],
            order: 1
          },
          {
            id: "les_con_2_2",
            slug: "grabacion-con-celular",
            title: "Grabación pro con celular",
            description: "Luz, audio y encuadre sin equipo caro.",
            type: "video",
            video: { id: "vid_con_2_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 560 },
            durationMinutes: 14,
            resources: [],
            order: 2
          },
          {
            id: "les_con_2_3",
            slug: "edicion-rapida-capcut",
            title: "Edición rápida con CapCut",
            description: "Workflow para editar un Reel en 15 minutos.",
            type: "exercise",
            durationMinutes: 15,
            resources: [],
            order: 3
          }
        ]
      },
      {
        id: "mod_con_3",
        slug: "modulo-3-publicacion-y-medicion",
        title: "Módulo 3 · Publicación y medición",
        description: "Publica con criterio y mide qué funcionó.",
        order: 3,
        lessons: [
          {
            id: "les_con_3_1",
            slug: "horarios-y-formatos",
            title: "Horarios, formatos y hashtags",
            description: "Qué sirve y qué es mito.",
            type: "video",
            video: { id: "vid_con_3_1", ...YT("dQw4w9WgXcQ"), durationSeconds: 480 },
            durationMinutes: 12,
            resources: [],
            order: 1
          },
          {
            id: "les_con_3_2",
            slug: "metricas-de-contenido",
            title: "Métricas de contenido que importan",
            description: "Alcance, retención y conversión.",
            type: "video",
            video: { id: "vid_con_3_2", ...YT("dQw4w9WgXcQ"), durationSeconds: 500 },
            durationMinutes: 13,
            resources: [],
            order: 2
          },
          {
            id: "les_con_3_3",
            slug: "iteracion-y-mejora",
            title: "Iteración continua",
            description: "Cómo mejorar tu contenido semana a semana.",
            type: "exercise",
            durationMinutes: 12,
            resources: [],
            order: 3
          }
        ]
      }
    ]
  }
];

/* --------------------------- Accesores --------------------------- */

const bySlug = new Map(courses.map((c) => [c.slug, c]));
const byId = new Map(courses.map((c) => [c.id, c]));

export function getAllCourses(): Course[] {
  return courses;
}

export function getFeaturedCourses(limit = 3): Course[] {
  return courses.filter((c) => c.featured).slice(0, limit);
}

export function getCourseBySlug(slug: string): Course | null {
  return bySlug.get(slug) ?? null;
}

export function getCourseById(id: string): Course | null {
  return byId.get(id) ?? null;
}

export function getOtherCourses(courseId: string, limit = 3): Course[] {
  return courses.filter((c) => c.id !== courseId).slice(0, limit);
}

export function getCourseStats(courseId: string): {
  totalModules: number;
  totalLessons: number;
  totalMinutes: number;
} {
  const course = byId.get(courseId);
  if (!course) return { totalModules: 0, totalLessons: 0, totalMinutes: 0 };
  const totalLessons = course.modules.reduce(
    (acc, m) => acc + m.lessons.length,
    0
  );
  const totalMinutes = course.modules.reduce(
    (acc, m) =>
      acc + m.lessons.reduce((a, l) => a + l.durationMinutes, 0),
    0
  );
  return {
    totalModules: course.modules.length,
    totalLessons,
    totalMinutes
  };
}

/* Búsqueda de lección dentro de un curso */
export function findLesson(
  course: Course,
  lessonSlug: string
):
  | { lesson: Course["modules"][0]["lessons"][0]; module: Course["modules"][0]; index: { module: number; lesson: number; global: number } }
  | null {
  let global = 0;
  for (let mi = 0; mi < course.modules.length; mi++) {
    const mod = course.modules[mi];
    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];
      if (lesson.slug === lessonSlug) {
        return { lesson, module: mod, index: { module: mi, lesson: li, global } };
      }
      global++;
    }
  }
  return null;
}

/** Lista plana de lecciones en orden, útil para anterior/siguiente. */
export function flatLessons(course: Course) {
  const out: {
    lesson: Course["modules"][0]["lessons"][0];
    moduleId: string;
    moduleTitle: string;
  }[] = [];
  for (const m of course.modules) {
    for (const l of m.lessons) {
      out.push({ lesson: l, moduleId: m.id, moduleTitle: m.title });
    }
  }
  return out;
}
