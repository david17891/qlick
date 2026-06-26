/**
 * Tipos del dominio — LMS Real Foundation (v0.7.0).
 *
 * Esta capa representa el modelo de negocio (camelCase, formas estables).
 * La capa física (snake_case, enums de Postgres) se mapea en
 * `src/lib/lms/mappers.ts` y se regenera vía
 * `npx supabase gen types typescript --linked` cuando se aplican migraciones.
 *
 * Convención:
 * - Enums: union de strings literales.
 * - Timestamps: ISO 8601 string (lo que devuelve Supabase).
 * - UUIDs: string.
 * - Campos opcionales: `string | null` (al estilo DB) para que el dominio
 *   refleje fielmente la presencia/ausencia en la tabla.
 *
 * IMPORTANTE: estos tipos son la NUEVA capa de dominio (BD real con 5 tablas:
 * courses, modules, lessons, enrollments, lesson_progress). NO rompen la capa
 * existente de `src/types/index.ts` que sigue siendo la fuente para el
 * catálogo demo embebido.
 */

/* ------------------------------------------------------------------ */
/* Enums del LMS                                                       */
/* ------------------------------------------------------------------ */

export type CourseStatus = "draft" | "published" | "archived";
export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type EnrollmentStatus = "active" | "completed" | "cancelled";

/**
 * Modelo de acceso del curso (v1.0.0).
 * - "free": contenido público con login (default). Sin course_access.required.
 * - "paid": requiere course_access.active. Botón "Inscribirme" redirige a /pagar.
 * - "freemium": gratis con contenido premium interno (fase futura, schema ya lo soporta).
 */
export type CourseAccessType = "free" | "paid" | "freemium";

/**
 * Estado de un derecho de acceso (course_access.access_status).
 * - "active": puede ver.
 * - "pending": creado pero no activado (ej. pago pendiente).
 * - "expired": venció (campo expires_at).
 * - "revoked": revocado manualmente (ej. refund).
 */
export type CourseAccessStatus = "active" | "pending" | "expired" | "revoked";

/**
 * Origen de un derecho de acceso.
 * - "free_course": grant por enrollment a curso gratis.
 * - "simulated_payment": pago via simulador (dev).
 * - "manual_admin": admin lo dio vía panel.
 * - "stripe" | "mercadopago" | "conekta": proveedores reales (futuro).
 * - "coupon": código promocional.
 */
export type CourseAccessSource =
  | "free_course"
  | "simulated_payment"
  | "manual_admin"
  | "stripe"
  | "mercadopago"
  | "conekta"
  | "coupon";

/**
 * Provider de pago (payments.provider).
 * "simulated" es para desarrollo; el resto son proveedores reales a integrar.
 */
export type PaymentProvider = "simulated" | "stripe" | "mercadopago" | "conekta";

/**
 * Estado de un pago (payments.status).
 * - "pending": creado, esperando confirmación.
 * - "paid": confirmado, activa el acceso.
 * - "failed": rechazado.
 * - "refunded": devuelto, debe revocar el acceso.
 * - "cancelled": cancelado antes de pagar.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

/**
 * Provider del asset de video. Coincide con los valores permitidos por el
 * CHECK constraint en `lessons.video_provider`.
 *
 * - `youtube`: ID de YouTube (11 chars) en `video_id`.
 * - `cloudflare_stream`: UID de Cloudflare Stream en `video_id`.
 * - `mux`: Playback ID de Mux en `video_id`.
 * - `local`: video subido al storage propio, `video_url` apunta al recurso.
 * - `external`: URL directa (p.ej. Vimeo unlisted) en `video_url`.
 */
export type LessonVideoProvider =
  | "youtube"
  | "cloudflare_stream"
  | "mux"
  | "local"
  | "external";

/* ------------------------------------------------------------------ */
/* Course — catálogo                                                     */
/* ------------------------------------------------------------------ */

export interface Course {
  id: string;
  /** Único. Slug humano para URL pública (`/cursos/[slug]`). */
  slug: string;
  title: string;
  /** Eslogan corto (debajo del título). */
  subtitle: string | null;
  /** Descripción larga (markdown ligero en UI). */
  description: string | null;
  coverImageUrl: string | null;
  status: CourseStatus;
  level: CourseLevel;
  /** Categoría libre (ej. "Ads", "Automatización", "Contenido"). */
  category: string | null;
  durationMinutes: number | null;
  instructorName: string | null;
  /** Precio en MXN. `null` = gratuito o "consultar". */
  priceMXN: number | null;
  /** Marca para destacar en home (`.order("is_featured", ...)`). */
  isFeatured: boolean;
  /** Orden estable para grid (menor = primero). */
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Module — bloque dentro de un course                                  */
/* ------------------------------------------------------------------ */

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Lesson — pieza atómica de aprendizaje                                */
/* ------------------------------------------------------------------ */

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  videoProvider: LessonVideoProvider | null;
  /** ID externo (YouTube, Cloudflare UID, Mux playback). */
  videoId: string | null;
  /** URL completa (alternativa a video_id). */
  videoUrl: string | null;
  durationMinutes: number | null;
  displayOrder: number;
  /** Si true, visible sin enrollment. */
  isFreePreview: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Enrollment — relación user ↔ course                                  */
/* ------------------------------------------------------------------ */

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  /** 0–100. Calculado server-side a partir de `lesson_progress`. */
  progressPercent: number;
  enrolledAt: string;
  /** Cuándo se marcó como completado (status='completed'). */
  completedAt: string | null;
  /**
   * Origen del enrollment. Útil para atribución.
   * - "qr": vino por QR/link con ?ref=qr
   * - "organic": vino por el catálogo
   * - "referral", "campaign", etc. para futuro
   * - null: no tracked (legacy / flujos viejos)
   */
  source: string | null;
}

/* ------------------------------------------------------------------ */
/* LessonProgress — marca individual de avance                          */
/* ------------------------------------------------------------------ */

export interface LessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  completed: boolean;
  /** Cuándo marcó completed=true. */
  completedAt: string | null;
  /** Segundos vistos (para reanudar video). */
  watchSeconds: number;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Inputs server-side                                                   */
/* ------------------------------------------------------------------ */

export interface CreateEnrollmentResult {
  ok: boolean;
  enrollmentId: string;
  /** true si persistió en Supabase; false si cayó a demo. */
  persisted: boolean;
  /** true si fue demo/fallback. */
  demo: boolean;
  note: string;
}

export interface MarkLessonCompleteResult {
  ok: boolean;
  /** true si persistió en Supabase; false si cayó a demo. */
  persisted: boolean;
  demo: boolean;
  note: string;
}

export interface UpdateEnrollmentProgressResult {
  ok: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Entitlements (v1.0.0) — derechos de acceso por curso                 */
/* ------------------------------------------------------------------ */

/**
 * Derecho de acceso de un usuario a un curso. Independiente de `Enrollment`:
 * modela "¿tiene derecho a ver el contenido?" (no "¿está apuntado?").
 *
 * Separar `Enrollment` de `CourseAccess` evita migraciones futuras cuando
 * se agreguen pagos reales (Stripe/MercadoPago/Conekta).
 */
export interface CourseAccess {
  id: string;
  userId: string;
  courseId: string;
  accessStatus: CourseAccessStatus;
  accessSource: CourseAccessSource;
  /** FK a `payments.id`. Null si el acceso no vino de un pago. */
  paymentId: string | null;
  /** Cuándo se le dio el acceso. */
  startsAt: string;
  /** Cuándo vence. `null` = permanente. */
  expiresAt: string | null;
  /** Audit trail libre. Ej: 'paid_via_sim_2026-06-25', 'refunded_2026-06-26'. */
  grantedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Registro de pago. Arranca con `provider='simulated'`. Cuando se integre
 * Stripe/MercadoPago/Conekta, el simulador se reemplaza por el webhook del
 * proveedor real manteniendo la misma estructura.
 *
 * Idempotencia: UNIQUE (user_id, course_id, idempotency_key). El simulador
 * (y luego el webhook real) usa el mismo key para evitar duplicados.
 */
export interface Payment {
  id: string;
  userId: string;
  courseId: string;
  provider: PaymentProvider;
  /** ID del pago en el provider (null en simulated o pending). */
  providerPaymentId: string | null;
  /** Monto en centavos MXN. */
  amountMxn: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resultado de `checkCourseAccess` / `checkLessonAccess`. Tagged union para
 * que el caller sepa con certeza por qué tiene o no acceso (sin booleanos
 * ambiguos ni acoplar al HTTP status).
 */
export type AccessResult =
  | {
      hasAccess: true;
      source: CourseAccessSource;
      expiresAt: string | null;
    }
  | {
      hasAccess: false;
      reason: "not_authenticated" | "no_access" | "expired";
    };