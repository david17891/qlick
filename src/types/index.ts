/**
 * Tipos del dominio de la plataforma Qlick.
 * Estos tipos son la fuente de verdad del modelo de datos.
 *
 * El MVP usa datos mock (src/lib/data/*) que implementan estos tipos.
 * En fase 1 se mapearán a tablas reales (Supabase) sin cambiar la superficie pública.
 */

/* ------------------------------------------------------------------ */
/* Usuarios y autenticación                                            */
/* ------------------------------------------------------------------ */

export type UserRole = "visitor" | "student" | "admin" | "instructor";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  bio?: string;
  /** Solo demo: nunca guardar contraseñas en texto plano en producción. */
  demoPasswordHint?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Instructor                                                          */
/* ------------------------------------------------------------------ */

export interface Instructor {
  id: string;
  name: string;
  title: string;
  bio: string;
  avatarUrl?: string;
  specialties: string[];
  social?: {
    linkedin?: string;
    instagram?: string;
    website?: string;
  };
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

export type VideoProvider =
  | "youtube"
  | "vimeo"
  | "cloudflare_stream"
  | "mux"
  | "custom";

export interface VideoAsset {
  id: string;
  provider: VideoProvider;
  /**
   - YouTube: videoId (11 caracteres) o URL completa.
   * - Vimeo: ID numérico o URL.
   * - Cloudflare Stream: UID.
   * - Mux: playback ID.
   * - Custom: URL directa o HTML.
   */
  source: string;
  /** Duración aproximada en segundos (opcional, para UI). */
  durationSeconds?: number;
  posterImageUrl?: string;
  /** Marca como no listado (solo informativo para YouTube). */
  unlisted?: boolean;
}

/* ------------------------------------------------------------------ */
/* Lecciones, módulos, cursos                                          */
/* ------------------------------------------------------------------ */

export type LessonType = "video" | "reading" | "exercise" | "quiz";

export interface Resource {
  id: string;
  title: string;
  type: "pdf" | "slide" | "template" | "link" | "file";
  url: string;
  description?: string;
}

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: LessonType;
  /** Para lecciones tipo video/quiz/etc. */
  video?: VideoAsset;
  durationMinutes: number;
  /** Contenido libre (markdown-like) para lecciones de lectura. */
  content?: string;
  resources: Resource[];
  isPreview?: boolean;
  order: number;
}

export interface Module {
  id: string;
  slug: string;
  title: string;
  description?: string;
  lessons: Lesson[];
  order: number;
}

export type CourseLevel = "basico" | "intermedio" | "avanzado";
export type CourseStatus = "gratis" | "pago" | "proximamente";

export interface CourseTag {
  id: string;
  label: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  thumbnailUrl: string;
  heroImageUrl?: string;
  level: CourseLevel;
  estimatedHours: number;
  instructorId: string;
  priceMXN: number;
  originalPriceMXN?: number;
  status: CourseStatus;
  tags: CourseTag[];
  whatYouWillLearn: string[];
  requirements: string[];
  targetAudience: string[];
  modules: Module[];
  /** Para destacar en home. */
  featured?: boolean;
  rating?: number;
  studentsCount?: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Inscripción y progreso                                              */
/* ------------------------------------------------------------------ */

export interface LessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  courseId: string;
  completed: boolean;
  /** 0–100. */
  percent: number;
  positionSeconds?: number;
  lastSeenAt?: string;
  completedAt?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  /** Origen del acceso: compra, cupón, gratuito, manual. */
  source: "purchase" | "coupon" | "free" | "manual";
  /** Porcentaje global calculado a partir de LessonProgress. */
  progressPercent: number;
  lastLessonId?: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Pagos                                                               */
/* ------------------------------------------------------------------ */

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "refunded";

export type PaymentMethod =
  | "card"
  | "oxxo"
  | "spei"
  | "wallet"
  | "coupon"
  | "free";

export interface Coupon {
  id: string;
  code: string;
  description: string;
  /** Porcentaje de descuento (0–100). */
  percentOff: number;
  /** Monto fijo de descuento en MXN (opcional, exclusivo con percentOff). */
  amountOffMXN?: number;
  maxRedemptions?: number;
  redeemCount: number;
  expiresAt?: string;
  active: boolean;
}

export interface Payment {
  id: string;
  userId: string;
  courseId: string;
  enrollmentId?: string;
  couponId?: string;
  provider: "mock" | "mercadopago" | "stripe" | "conekta";
  method: PaymentMethod;
  status: PaymentStatus;
  amountMXN: number;
  discountMXN: number;
  currency: "MXN";
  /** Referencia externa del proveedor (cuando sea real). */
  externalReference?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Certificados                                                        */
/* ------------------------------------------------------------------ */

export interface Certificate {
  id: string;
  userId: string;
  courseId: string;
  code: string;
  issuedAt: string;
  /** URL simulada del PDF. */
  pdfUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Contenido público (testimonios, FAQ)                                */
/* ------------------------------------------------------------------ */

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company?: string;
  avatarUrl?: string;
  quote: string;
  rating: number;
  courseSlug?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "cursos" | "pagos" | "acceso" | "certificados" | "general";
}

/* ------------------------------------------------------------------ */
/* Métricas y utilidades                                               */
/* ------------------------------------------------------------------ */

export interface CourseStats {
  totalModules: number;
  totalLessons: number;
  totalMinutes: number;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  type: "lesson_completed" | "course_started" | "course_completed" | "purchase" | "login";
  message: string;
  courseId?: string;
  lessonId?: string;
  createdAt: string;
}
