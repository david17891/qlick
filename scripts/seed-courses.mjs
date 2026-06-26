#!/usr/bin/env node
/**
 * seed-courses.mjs — Carga el catálogo demo a Supabase (v1.0.0)
 *
 * Inserta los 5 cursos demo (Fundamentos, Meta Ads, Automatización,
 * Contenido, Email Marketing) en las tablas `courses`, `modules`, `lessons`.
 * Idempotente: si el slug ya
 * existe, lo skipea (no duplica).
 *
 * FUENTE DE DATOS: los datos vienen de `src/lib/data/courses.ts` (mock legacy).
 * Si actualizás el catálogo demo, regenerá este script manualmente o copiá
 * los cambios. Cuando el catálogo venga de otro lado (CMS, partner), este
 * script se reemplaza.
 *
 * REQUISITOS:
 *   - .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY
 *   - Migración v0.7.0 (LMS Real Foundation) aplicada
 *   - Migración v0.9.0 (enrollments.source) aplicada
 *   - Migración v1.0.0 (entitlements: courses.access_type + course_access + payments) aplicada
 *
 * Entitlements (v1.0.0):
 *   - 1 curso paid (publicidad-facebook-instagram-ads, $499 MXN)
 *   - 3 cursos free (fundamentos, automatizacion, contenido)
 *   - 1 curso freemium (email-marketing-automatizacion, $999 MXN premium)
 *   - El paso `ensureAccessConfig` al final actualiza access_type/price_mxn de los
 *     cursos que ya existían antes de esta migración (idempotente, no-op si ya está OK).
 *
 * USO:
 *   npm run seed:courses
 *
 * SALIDA:
 *   - Lista de cursos procesados con su UUID real en Supabase
 *   - Mapping final slug → UUID para usar en otros scripts/debug
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================
// 1. Cargar .env.local manualmente (Node no lo hace solo)
// =============================================================
const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error(`✗ No se encontró .env.local en ${envPath}`);
  console.error("  Copiá .env.example a .env.local y completá las keys.");
  process.exit(1);
}

const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "✗ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local",
  );
  process.exit(1);
}

console.log(`→ Conectando a ${url}\n`);

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// =============================================================
// 2. Datos del catálogo
//    FUENTE: src/lib/data/courses.ts (mock legacy).
//    Estructura aplanada para insertar en 3 tablas.
// =============================================================

/** Helper para mapear el legacy level "basico" | "intermedio" | "avanzado" → enum DB. */
function mapLevel(legacy) {
  if (legacy === "basico") return "beginner";
  if (legacy === "intermedio") return "intermediate";
  if (legacy === "avanzado") return "advanced";
  return "beginner";
}

/** Helper para mapear el video provider legacy → enum DB. */
function mapVideoProvider(legacyProvider) {
  if (legacyProvider === "youtube") return "youtube";
  if (legacyProvider === "vimeo" || legacyProvider === "custom") {
    return "external";
  }
  return null;
}

const COURSES = [
  // 1. Fundamentos de Marketing Digital
  {
    slug: "fundamentos-marketing-digital",
    title: "Fundamentos de Marketing Digital",
    subtitle: null,
    description:
      "Domina los pilares del marketing digital: embudo, audiencias, canales y medición. El punto de partida para cualquier estrategia.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
    level: "beginner",
    category: "Estrategia",
    durationMinutes: 360,
    instructorName: "Emilio",
    priceMXN: 0,
    isFeatured: true,
    displayOrder: 1,
    accessType: "free",
    modules: [
      {
        title: "Módulo 1 · Mentalidad estratégica",
        description:
          "Cómo piensa un estratega de marketing antes de tocar una sola herramienta.",
        displayOrder: 1,
        lessons: [
          {
            title: "¿Qué es el marketing digital hoy?",
            description:
              "Desmitificamos el marketing digital y lo conectamos con resultados de negocio.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 1,
            isFreePreview: true,
          },
          {
            title: "El embudo de conversión explicado simple",
            description:
              "ATRAER, CONVERTIR, FIDELIZAR. Cómo encaja cada canal en cada etapa.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Buyer persona y propuesta de valor",
            description:
              "Ejercicio guiado para definir a quién le hablas y por qué debería elegirte.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 2 · Canales y mensajes",
        description: "Qué canal usar, cuándo y con qué tipo de contenido.",
        displayOrder: 2,
        lessons: [
          {
            title: "Mapa de canales: orgánico vs. pagado",
            description:
              "Comparativa honesta de redes, email, SEO y anuncios.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Cómo escribir un mensaje que conecte",
            description:
              "Fórmulas prácticas de copywriting aplicado a redes y anuncios.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Tu primer calendario de contenido",
            description: "Armamos un calendario real para 4 semanas.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 3 · Medición y plan de 90 días",
        description: "Métricas que importan y cómo aterrizar tu plan.",
        displayOrder: 3,
        lessons: [
          {
            title: "Las 5 métricas que de verdad importan",
            description:
              "CTR, CPL, ROAS, CAC y LTV explicados sin tecnicismos.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Herramientas gratuitas para empezar",
            description:
              "GA4, Meta Business, Looker Studio y otras utilidades.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 10,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Construye tu plan de 90 días",
            description: "Lección final con entregable: tu plan accionable.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 18,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
    ],
  },

  // 2. Publicidad en Facebook e Instagram Ads
  {
    slug: "publicidad-facebook-instagram-ads",
    title: "Publicidad en Facebook e Instagram Ads",
    subtitle: null,
    description:
      "Crea, lanza y optimiza campañas rentables en Meta Ads. Del píxel al escalamiento.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=900&q=80",
    level: "intermediate",
    category: "Meta Ads",
    durationMinutes: 540,
    instructorName: "Sofía",
    priceMXN: 499,
    isFeatured: true,
    displayOrder: 2,
    accessType: "paid",
    modules: [
      {
        title: "Módulo 1 · Configuración profesional",
        description:
          "Todo lo que debe estar bien antes de gastar un peso.",
        displayOrder: 1,
        lessons: [
          {
            title: "Business Manager y Píxel de Meta",
            description: "Instalación del píxel y verificación de eventos.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 18,
            displayOrder: 1,
            isFreePreview: true,
          },
          {
            title: "Eventos clave y Conversions API",
            description:
              "Qué eventos rastrear y por qué importa la CAPI post-iOS 14.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Audiencias, custom y lookalike",
            description:
              "Cómo construir audiencias que de verdad convierten.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 2 · Creatividad que convierte",
        description:
          "Anuncios que detienen el scroll y generan clics de calidad.",
        displayOrder: 2,
        lessons: [
          {
            title: "Anatomía de un anuncio ganador",
            description: "Visual, copy, gancho y llamada a la acción.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Formatos y pruebas A/B",
            description:
              "Reels, carruseles e imágenes. Qué probar primero.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Espionaje ético con Ad Library",
            description:
              "Cómo investigar a tu competencia sin copiar.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 3 · Optimización y escalamiento",
        description: "De campaña aprendiendo a campaña rentable.",
        displayOrder: 3,
        lessons: [
          {
            title: "Leer métricas como un pro",
            description: "Interpretar Result, Coste, ROAS y frecuencia.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Escalamiento vertical y horizontal",
            description: "Cómo subir presupuesto sin matar la campaña.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Retargeting y fidelización",
            description:
              "Vuelve a conectar con quienes no compraron la primera vez.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
    ],
  },

  // 3. Automatización de Ventas con WhatsApp y CRM
  {
    slug: "automatizacion-ventas-whatsapp-crm",
    title: "Automatización de Ventas con WhatsApp y CRM",
    subtitle: null,
    description:
      "Convierte conversaciones de WhatsApp en ventas automáticas con un CRM bien montado.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=900&q=80",
    level: "intermediate",
    category: "Automatización",
    durationMinutes: 480,
    instructorName: "Andrés",
    priceMXN: 1799,
    isFeatured: false,
    displayOrder: 3,
    accessType: "free",
    modules: [
      {
        title: "Módulo 1 · Fundamentos de WhatsApp Business",
        description:
          "Lo que necesitas bien configurado antes de automatizar.",
        displayOrder: 1,
        lessons: [
          {
            title: "WhatsApp Business vs. WhatsApp API",
            description: "Cuál te conviene según tu volumen.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 1,
            isFreePreview: true,
          },
          {
            title: "Catálogo y perfil optimizado",
            description: "Convierte tu perfil en una vitrina de ventas.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Plantillas oficiales (HSM)",
            description: "Cómo redactar plantillas que Meta aprueba.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 2 · Chatbots sin código",
        description: "Construye árboles de conversación que califican leads.",
        displayOrder: 2,
        lessons: [
          {
            title: "Diseña el mapa de conversación",
            description: "Estructura para no abrumar al cliente.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Herramientas no-code para chatbots",
            description: "Comparativa y setup de la opción recomendada.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Construye tu bot calificador",
            description: "Lección práctica: armamos un bot de 3 preguntas.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 3 · CRM y automatizaciones",
        description: "Conecta todo y deja que el sistema trabaje por ti.",
        displayOrder: 3,
        lessons: [
          {
            title: "Conexión con tu CRM",
            description: "Integración paso a paso.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Automáticos de seguimiento",
            description: "Recordatorios y recuperación de carrito.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Mide las conversiones de WhatsApp",
            description: "Dashboard básico y optimización.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
    ],
  },

  // 4. Creación de Contenido para Redes Sociales
  {
    slug: "creacion-contenido-redes-sociales",
    title: "Creación de Contenido para Redes Sociales",
    subtitle: null,
    description:
      "Produce contenido que se comparte, convierte y construye marca. Del planning al reel.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1542744095-fcf48d80b0fd?auto=format&fit=crop&w=900&q=80",
    level: "beginner",
    category: "Contenido",
    durationMinutes: 420,
    instructorName: "Luisa",
    priceMXN: 1299,
    isFeatured: false,
    displayOrder: 4,
    accessType: "free",
    modules: [
      {
        title: "Módulo 1 · Estrategia de contenido",
        description: "Antes de grabar, piensa. Aquí diseñamos el sistema.",
        displayOrder: 1,
        lessons: [
          {
            title: "Define tus pilares de contenido",
            description: "3 a 5 temas que sostienen toda tu marca.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 1,
            isFreePreview: true,
          },
          {
            title: "Construye un banco de ideas infinitas",
            description: "Método para nunca más quedarte sin ideas.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Calendario editorial de 30 días",
            description: "Práctica: arma tu mes de contenido.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 2 · Producción (Reels y carruseles)",
        description: "Cómo grabar y armar piezas que detienen el scroll.",
        displayOrder: 2,
        lessons: [
          {
            title: "Guion de Reel que engancha",
            description: "Estructura de 3 segundos para ganar atención.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Grabación pro con celular",
            description: "Luz, audio y encuadre sin equipo caro.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Edición rápida con CapCut",
            description: "Workflow para editar un Reel en 15 minutos.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 3 · Publicación y medición",
        description: "Publica con criterio y mide qué funcionó.",
        displayOrder: 3,
        lessons: [
          {
            title: "Horarios, formatos y hashtags",
            description: "Qué sirve y qué es mito.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Métricas de contenido que importan",
            description: "Alcance, retención y conversión.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Iteración continua",
            description: "Cómo mejorar tu contenido semana a semana.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
    ],
  },

  // 5. Email Marketing y Automatización (FREEMIUM)
  //    - Módulo 1 gratis (3 lecciones isFreePreview=true)
  //    - Módulos 2 y 3 premium (requieren pago del precio premium)
  //    - access_type="freemium" en DB; el badge muestra "Gratis + Premium"
  {
    slug: "email-marketing-automatizacion",
    title: "Email Marketing y Automatización",
    subtitle: "Empieza gratis, desbloquea el resto cuando estés listo",
    description:
      "Convierte suscriptores en clientes con secuencias de email y flujos automatizados. El Módulo 1 es gratis para que veas la calidad antes de pagar el resto.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1596526131083-e8c633c948d2?auto=format&fit=crop&w=900&q=80",
    level: "intermediate",
    category: "Email Marketing",
    durationMinutes: 480,
    instructorName: "Mariana",
    priceMXN: 999,
    isFeatured: false,
    displayOrder: 5,
    accessType: "freemium",
    modules: [
      {
        title: "Módulo 1 · Fundamentos (Gratis)",
        description:
          "Lo esencial de email marketing, sin pagar. Para arrancar con buen pie.",
        displayOrder: 1,
        lessons: [
          {
            title: "El papel del email en tu estrategia",
            description:
              "Por qué email sigue siendo el canal con mejor ROI aunque todos hablan de redes.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 1,
            isFreePreview: true,
          },
          {
            title: "Cómo armar tu lista desde cero",
            description:
              "Lead magnets y opt-in forms que sí convierten (qué ofrecer y dónde).",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: true,
          },
          {
            title: "Métricas clave de email marketing",
            description:
              "Open rate, CTR, conversion rate y entregability. Cuáles mirar y cuáles ignorar.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 13,
            displayOrder: 3,
            isFreePreview: true,
          },
        ],
      },
      {
        title: "Módulo 2 · Secuencias automatizadas (Premium)",
        description:
          "Workflows que convierten mientras dormís. Bienvenida, nurturing y venta.",
        displayOrder: 2,
        lessons: [
          {
            title: "Anatomía de una secuencia ganadora",
            description:
              "Estructura probada de 5 emails para el ciclo bienvenida → venta.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 15,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Segmentación avanzada",
            description:
              "Crea segmentos dinámicos que activan journeys personalizados.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 16,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "A/B testing de asunto y copy",
            description:
              "Qué testear primero, cómo medir bien y cuándo decidir.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 12,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
      {
        title: "Módulo 3 · Monetización (Premium)",
        description:
          "Convierte tu lista en tu canal de ingresos más predecible.",
        displayOrder: 3,
        lessons: [
          {
            title: "Lanzamientos por email",
            description:
              "Cómo estructurar un launch de 5 días paso a paso.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 18,
            displayOrder: 1,
            isFreePreview: false,
          },
          {
            title: "Recurrencia y retención",
            description:
              "Newsletter paga y suscripción mensual: cómo fijar precio y cadencia.",
            videoProvider: "youtube",
            videoId: "dQw4w9WgXcQ",
            videoUrl: null,
            durationMinutes: 14,
            displayOrder: 2,
            isFreePreview: false,
          },
          {
            title: "Tu primer funnel automatizado",
            description:
              "Armamos juntos un funnel completo de lead a venta.",
            videoProvider: null,
            videoId: null,
            videoUrl: null,
            durationMinutes: 17,
            displayOrder: 3,
            isFreePreview: false,
          },
        ],
      },
    ],
  },
];

// =============================================================
// 3. Funciones de seed (idempotentes)
// =============================================================

async function seedCourse(course) {
  process.stdout.write(`→ "${course.title}" (${course.slug})... `);

  // Check si ya existe
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", course.slug)
    .maybeSingle();

  let courseId;
  if (existing) {
    courseId = existing.id;
    process.stdout.write(`ya existe ✓\n`);
  } else {
    const { data, error } = await supabase
      .from("courses")
      .insert({
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle,
        description: course.description,
        cover_image_url: course.coverImageUrl,
        status: "published",
        level: course.level,
        category: course.category,
        duration_minutes: course.durationMinutes,
        instructor_name: course.instructorName,
        price_mxn: course.priceMXN,
        is_featured: course.isFeatured,
        display_order: course.displayOrder,
        access_type: course.accessType,
      })
      .select("id")
      .single();

    if (error) {
      console.log(`\n  ✗ Error insertando curso: ${error.message}`);
      return null;
    }
    courseId = data.id;
    process.stdout.write(`creado ✓\n`);
  }

  // Módulos + lecciones
  for (const mod of course.modules) {
    const { data: existingMod } = await supabase
      .from("modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("title", mod.title)
      .maybeSingle();

    let moduleId;
    if (existingMod) {
      moduleId = existingMod.id;
    } else {
      const { data, error } = await supabase
        .from("modules")
        .insert({
          course_id: courseId,
          title: mod.title,
          description: mod.description,
          display_order: mod.displayOrder,
        })
        .select("id")
        .single();

      if (error) {
        console.log(`  ✗ Error insertando módulo "${mod.title}": ${error.message}`);
        continue;
      }
      moduleId = data.id;
    }

    // Lecciones del módulo
    let lessonsInserted = 0;
    let lessonsSkipped = 0;
    for (const lesson of mod.lessons) {
      const { data: existingLesson } = await supabase
        .from("lessons")
        .select("id")
        .eq("module_id", moduleId)
        .eq("title", lesson.title)
        .maybeSingle();

      if (existingLesson) {
        lessonsSkipped++;
        continue;
      }

      const { error: lessonError } = await supabase.from("lessons").insert({
        module_id: moduleId,
        title: lesson.title,
        description: lesson.description,
        video_provider: lesson.videoProvider,
        video_id: lesson.videoId,
        video_url: lesson.videoUrl,
        duration_minutes: lesson.durationMinutes,
        display_order: lesson.displayOrder,
        is_free_preview: lesson.isFreePreview,
      });

      if (lessonError) {
        console.log(
          `  ✗ Error insertando lección "${lesson.title}": ${lessonError.message}`,
        );
      } else {
        lessonsInserted++;
      }
    }

    const total = lessonsInserted + lessonsSkipped;
    const skipNote = lessonsSkipped > 0 ? ` (${lessonsSkipped} ya existían)` : "";
    console.log(`    • ${mod.title}: ${total} lecciones${skipNote}`);
  }

  return { slug: course.slug, id: courseId };
}

// =============================================================
// 3.5. ensureAccessConfig (v1.0.0)
//     Actualiza access_type + price_mxn en cursos que ya existían.
//     Idempotente: si access_type ya coincide, el UPDATE es no-op.
// =============================================================

async function ensureAccessConfig() {
  const updates = COURSES.map((c) => ({
    slug: c.slug,
    access_type: c.accessType,
    price_mxn: c.accessType === "free" ? 0 : c.priceMXN,
  }));

  let updated = 0;
  let skipped = 0;
  for (const u of updates) {
    const { data: existing } = await supabase
      .from("courses")
      .select("access_type, price_mxn")
      .eq("slug", u.slug)
      .maybeSingle();

    if (!existing) {
      // No existe todavía — el INSERT del seedCourse lo creará con los valores correctos.
      skipped++;
      continue;
    }

    if (existing.access_type === u.access_type && existing.price_mxn === u.price_mxn) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("courses")
      .update({ access_type: u.access_type, price_mxn: u.price_mxn })
      .eq("slug", u.slug);

    if (error) {
      console.log(`  ✗ Error actualizando ${u.slug}: ${error.message}`);
    } else {
      updated++;
    }
  }

  console.log(`🔧 ensureAccessConfig: ${updated} actualizados, ${skipped} sin cambios\n`);
}

// =============================================================
// 4. Main
// =============================================================

async function main() {
  console.log("📚 Seed de catálogo demo → Supabase\n");
  console.log(`Cursos a procesar: ${COURSES.length}\n`);

  // Pre-paso (v1.0.0): asegurar access_type + price_mxn correctos para cursos
  // que ya existían antes de esta migración. Idempotente (no-op si ya están OK).
  await ensureAccessConfig();

  const results = {};
  let successCount = 0;
  let failCount = 0;

  for (const course of COURSES) {
    const result = await seedCourse(course);
    if (result) {
      results[result.slug] = result.id;
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `\n✓ Seed terminado: ${successCount} ok, ${failCount} con errores`,
  );

  if (Object.keys(results).length > 0) {
    console.log(`\nMapping slug → UUID (para debug / tests):`);
    for (const [slug, id] of Object.entries(results)) {
      console.log(`  ${slug.padEnd(45)} ${id}`);
    }
  }

  console.log(`\n💡 Próximo paso:`);
  console.log(`   1. Verificá en Supabase → Table Editor → courses/modules/lessons`);
  console.log(`   2. Probá: npm run dev → http://localhost:3000/cursos`);
  console.log(
    `   3. Probá inscripción: http://localhost:3000/inscripcion/fundamentos-marketing-digital`,
  );

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n✗ Error fatal:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
