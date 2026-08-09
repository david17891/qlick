import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AdminDashboardCourse {
  id: string;
  slug: string;
  title: string;
  status: string;
  priceMXN: number | null;
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
}

export interface AdminDashboardEnrollment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  status: string;
  progressPercent: number;
  enrolledAt: string;
  source: string | null;
}

export interface AdminDashboardStudent {
  id: string;
  name: string;
  email: string;
  role: string;
  enrollmentCount: number;
  progressPercent: number;
}

export interface AdminDashboardPayment {
  id: string;
  origin: "event" | "service";
  reference: string;
  customerName: string;
  product: string;
  method: string;
  amountMXN: number;
  status: string;
  createdAt: string;
}

export interface AdminDashboardSnapshot {
  mode: "real" | "unavailable";
  generatedAt: string;
  warning: string | null;
  lms: {
    courses: AdminDashboardCourse[];
    enrollments: AdminDashboardEnrollment[];
    students: AdminDashboardStudent[];
    averageProgress: number;
  };
  crm: {
    totalLeads: number;
    byStatus: Record<string, number>;
    paymentPending: number;
  };
  events: {
    total: number;
    published: number;
    upcoming: number;
    confirmationsPendingPayment: number;
  };
  payments: {
    rows: AdminDashboardPayment[];
    approvedMXN: number;
    pendingMXN: number;
    pendingCount: number;
  };
  integrations: {
    supabase: "active" | "unavailable";
    whatsapp: "active" | "unavailable";
    stripe: "configured" | "not_configured";
    brevo: "configured" | "not_configured";
  };
}

interface AuthUserRow {
  id: string;
  email?: string;
  user_metadata?: unknown;
  app_metadata?: unknown;
}

interface CourseRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  price_mxn: number | string | null;
}

interface ModuleRow {
  id: string;
  course_id: string;
}

interface LessonRow {
  id: string;
  module_id: string;
}

interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress_percent: number | null;
  enrolled_at: string;
  source: string | null;
}

interface EventRow {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
}

interface ConfirmationRow {
  id: string;
  event_id: string;
  name: string;
  payment_status: string | null;
}

interface EventPaymentRow {
  id: string;
  confirmation_id: string;
  method: string;
  status: string;
  amount_mxn: number | string;
  external_reference: string | null;
  created_at: string;
}

interface ServiceRow {
  id: string;
  display_name: string;
}

interface ServiceVariantRow {
  id: string;
  label: string;
}

interface ServiceOrderRow {
  id: string;
  order_number: string;
  service_id: string;
  variant_id: string;
  customer_name: string;
  amount_mxn: number | string;
  payment_status: string;
  payment_mode: string;
  created_at: string;
}

function numeric(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function authUserName(user: AuthUserRow): string {
  const metadata = recordOf(user.user_metadata);
  const name = metadata.full_name ?? metadata.name;
  return typeof name === "string" && name.trim() ? name.trim() : user.email?.split("@")[0] ?? "Usuario";
}

function authUserRole(user: AuthUserRow): string {
  const appMetadata = recordOf(user.app_metadata);
  const userMetadata = recordOf(user.user_metadata);
  const role = appMetadata.role ?? userMetadata.role;
  return typeof role === "string" && role.trim() ? role : "usuario";
}

function emptySnapshot(mode: AdminDashboardSnapshot["mode"], warning: string | null): AdminDashboardSnapshot {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    warning,
    lms: { courses: [], enrollments: [], students: [], averageProgress: 0 },
    crm: { totalLeads: 0, byStatus: {}, paymentPending: 0 },
    events: { total: 0, published: 0, upcoming: 0, confirmationsPendingPayment: 0 },
    payments: { rows: [], approvedMXN: 0, pendingMXN: 0, pendingCount: 0 },
    integrations: {
      supabase: mode === "real" ? "active" : "unavailable",
      whatsapp: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ? "active" : "unavailable",
      stripe: process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured",
      brevo: process.env.BREVO_API_KEY ? "configured" : "not_configured",
    },
  };
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  if (!checkSupabaseConfig().configured) {
    return emptySnapshot("unavailable", "Supabase no está configurado; no se muestran datos de demostración.");
  }

  const snapshot = emptySnapshot("real", null);
  const supabase = createSupabaseAdminClient();

  const [coursesResult, modulesResult, lessonsResult, enrollmentsResult, eventsResult, confirmationsResult, eventPaymentsResult, servicesResult, variantsResult, serviceOrdersResult, leadsResult, authUsersResult] = await Promise.all([
    supabase.from("courses" as never).select("id, slug, title, status, price_mxn") as never,
    supabase.from("modules" as never).select("id, course_id") as never,
    supabase.from("lessons" as never).select("id, module_id") as never,
    supabase.from("enrollments" as never).select("id, user_id, course_id, status, progress_percent, enrolled_at, source") as never,
    supabase.from("events" as never).select("id, title, status, starts_at") as never,
    supabase.from("event_confirmations" as never).select("id, event_id, name, payment_status") as never,
    supabase.from("event_payments" as never).select("id, confirmation_id, method, status, amount_mxn, external_reference, created_at") as never,
    supabase.from("services" as never).select("id, display_name") as never,
    supabase.from("service_variants" as never).select("id, label") as never,
    supabase.from("service_orders" as never).select("id, order_number, service_id, variant_id, customer_name, amount_mxn, payment_status, payment_mode, created_at") as never,
    supabase.from("leads" as never).select("status") as never,
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const courses = (coursesResult as { data: CourseRow[] | null; error: { message?: string } | null }).data ?? [];
  const modules = (modulesResult as { data: ModuleRow[] | null }).data ?? [];
  const lessons = (lessonsResult as { data: LessonRow[] | null }).data ?? [];
  const enrollments = (enrollmentsResult as { data: EnrollmentRow[] | null }).data ?? [];
  const events = (eventsResult as { data: EventRow[] | null }).data ?? [];
  const confirmations = (confirmationsResult as { data: ConfirmationRow[] | null }).data ?? [];
  const eventPayments = (eventPaymentsResult as { data: EventPaymentRow[] | null }).data ?? [];
  const services = (servicesResult as { data: ServiceRow[] | null }).data ?? [];
  const variants = (variantsResult as { data: ServiceVariantRow[] | null }).data ?? [];
  const serviceOrders = (serviceOrdersResult as { data: ServiceOrderRow[] | null }).data ?? [];
  const leads = (leadsResult as { data: Array<{ status: string }> | null }).data ?? [];
  const authUsers = (authUsersResult.data?.users ?? []) as AuthUserRow[];

  const userById = new Map(authUsers.map((user) => [user.id, user]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const confirmationById = new Map(confirmations.map((confirmation) => [confirmation.id, confirmation]));
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const moduleIdsByCourse = new Map<string, Set<string>>();
  for (const courseModule of modules) {
    const ids = moduleIdsByCourse.get(courseModule.course_id) ?? new Set<string>();
    ids.add(courseModule.id);
    moduleIdsByCourse.set(courseModule.course_id, ids);
  }
  const lessonCountByModule = new Map<string, number>();
  for (const lesson of lessons) {
    lessonCountByModule.set(lesson.module_id, (lessonCountByModule.get(lesson.module_id) ?? 0) + 1);
  }
  const enrollmentCountByCourse = new Map<string, number>();
  for (const enrollment of enrollments) {
    enrollmentCountByCourse.set(enrollment.course_id, (enrollmentCountByCourse.get(enrollment.course_id) ?? 0) + 1);
  }

  snapshot.lms.courses = courses.map((course) => {
    const moduleIds = moduleIdsByCourse.get(course.id) ?? new Set<string>();
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      status: course.status,
      priceMXN: course.price_mxn === null ? null : numeric(course.price_mxn),
      moduleCount: moduleIds.size,
      lessonCount: Array.from(moduleIds).reduce((sum, moduleId) => sum + (lessonCountByModule.get(moduleId) ?? 0), 0),
      enrollmentCount: enrollmentCountByCourse.get(course.id) ?? 0,
    };
  });

  snapshot.lms.enrollments = enrollments.map((enrollment) => {
    const user = userById.get(enrollment.user_id);
    const course = courseById.get(enrollment.course_id);
    return {
      id: enrollment.id,
      userId: enrollment.user_id,
      userName: user ? authUserName(user) : "Usuario no encontrado",
      userEmail: user?.email ?? "",
      courseId: enrollment.course_id,
      courseTitle: course?.title ?? "Curso no encontrado",
      status: enrollment.status,
      progressPercent: Math.max(0, Math.min(100, Math.round(numeric(enrollment.progress_percent)))),
      enrolledAt: enrollment.enrolled_at,
      source: enrollment.source,
    };
  });

  const studentEnrollments = new Map<string, AdminDashboardEnrollment[]>();
  for (const enrollment of snapshot.lms.enrollments) {
    const list = studentEnrollments.get(enrollment.userId) ?? [];
    list.push(enrollment);
    studentEnrollments.set(enrollment.userId, list);
  }
  snapshot.lms.students = Array.from(studentEnrollments.entries()).map(([id, rows]) => {
    const user = userById.get(id);
    return {
      id,
      name: rows[0]?.userName ?? (user ? authUserName(user) : "Usuario no encontrado"),
      email: rows[0]?.userEmail ?? user?.email ?? "",
      role: user ? authUserRole(user) : "student",
      enrollmentCount: rows.length,
      progressPercent: Math.round(rows.reduce((sum, row) => sum + row.progressPercent, 0) / rows.length),
    };
  });

  snapshot.lms.averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, enrollment) => sum + numeric(enrollment.progress_percent), 0) / enrollments.length)
    : 0;

  const byStatus: Record<string, number> = {};
  for (const lead of leads) byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
  snapshot.crm = {
    totalLeads: leads.length,
    byStatus,
    paymentPending: byStatus.payment_pending ?? 0,
  };

  const now = Date.now();
  snapshot.events = {
    total: events.length,
    published: events.filter((event) => event.status === "published").length,
    upcoming: events.filter((event) => event.status === "published" && event.starts_at && Date.parse(event.starts_at) >= now).length,
    confirmationsPendingPayment: confirmations.filter((confirmation) => confirmation.payment_status === "pending" || confirmation.payment_status === "pending_verification").length,
  };

  const payments: AdminDashboardPayment[] = [];
  for (const payment of eventPayments) {
    const confirmation = confirmationById.get(payment.confirmation_id);
    const event = confirmation ? eventById.get(confirmation.event_id) : undefined;
    payments.push({
      id: payment.id,
      origin: "event",
      reference: payment.external_reference ?? payment.id,
      customerName: confirmation?.name ?? "Confirmación sin nombre",
      product: event?.title ?? "Evento no encontrado",
      method: payment.method,
      amountMXN: numeric(payment.amount_mxn),
      status: payment.status,
      createdAt: payment.created_at,
    });
  }
  for (const order of serviceOrders) {
    const service = serviceById.get(order.service_id);
    const variant = variantById.get(order.variant_id);
    payments.push({
      id: order.id,
      origin: "service",
      reference: order.order_number,
      customerName: order.customer_name,
      product: [service?.display_name, variant?.label].filter(Boolean).join(" · ") || "Servicio",
      method: order.payment_mode,
      amountMXN: numeric(order.amount_mxn),
      status: order.payment_status || order.payment_mode,
      createdAt: order.created_at,
    });
  }
  payments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  snapshot.payments.rows = payments;
  snapshot.payments.approvedMXN = payments
    .filter((payment) => payment.status === "approved" || payment.status === "paid" || payment.status === "paid_manual")
    .reduce((sum, payment) => sum + payment.amountMXN, 0);
  snapshot.payments.pendingMXN = payments
    .filter((payment) => payment.status === "pending" || payment.status === "processing")
    .reduce((sum, payment) => sum + payment.amountMXN, 0);
  snapshot.payments.pendingCount = payments.filter((payment) => payment.status === "pending" || payment.status === "processing").length;

  const firstError = [
    coursesResult,
    modulesResult,
    lessonsResult,
    enrollmentsResult,
    eventsResult,
    confirmationsResult,
    eventPaymentsResult,
    servicesResult,
    variantsResult,
    serviceOrdersResult,
    leadsResult,
  ].find((result) => (result as { error?: unknown }).error);
  if (firstError) {
    snapshot.warning = "Una fuente administrativa no respondió completa; se muestran solo los datos que sí pudieron leerse.";
  }

  return snapshot;
}
