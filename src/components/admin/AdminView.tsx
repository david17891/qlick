"use client";

import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User, PaymentStatus } from "@/types";
import { getCurrentUser } from "@/lib/auth/mock-auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Container, Card, Button, Badge, EmptyState, ProgressBar, Skeleton } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import {
  BarChart3,
  Bot,
  Check,
  CreditCard,
  Lock,
  Magnet,
  MessageCircle,
  Rocket,
  School,
  ShoppingBag,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  Wallet
} from "lucide-react";
import { StatCard } from "@/components/dashboard";
import {
  getAllCourses,
  getCourseStats
} from "@/lib/data/courses";
import {
  getAllEnrollments,
  countEnrollmentsByCourse
} from "@/lib/data/enrollments";
import { getAllUsers } from "@/lib/data/users";
import { getAllPayments, sumRevenue } from "@/lib/data/payments";
import { listPaymentProviders } from "@/lib/payments";
import { formatMXN, formatDate, initials, formatDuration } from "@/lib/utils";
import { CRMView } from "@/components/crm";
import { BotConfigTab } from "@/components/admin/BotConfigTab";
import { ConversationsTab } from "@/components/admin/ConversationsTab";
import { OrdersTab } from "@/components/admin/OrdersTab";
import Link from "next/link";

type Tab = "resumen" | "cursos" | "alumnos" | "inscripciones" | "pagos" | "pedidos" | "crm" | "conversations" | "bot" | "futuro";

const statusTone: Record<PaymentStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  expired: "neutral",
  refunded: "info",
  failed: "danger",
  disputed: "warning",
  suspicious_amount_discrepancy: "danger"
};

const statusLabel: Record<PaymentStatus, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  expired: "Vencido",
  refunded: "Reembolsado",
  failed: "Falló",
  disputed: "En disputa",
  suspicious_amount_discrepancy: "Importe sospechoso"
};

export function AdminView(
  {
    adminEmail,
    botV2Enabled
  }: {
    adminEmail?: string;
    /**
     * FIX 2026-07-10 (Sprint 2.1): estado del Motor IA Socrático v2
     * (deepseek_tools_enabled). Inyectado por el server component padre
     * (`/admin/page.tsx`) leyendo `system_settings`. Mostramos un
     * mini-badge al lado del botón de navegación para que David
     * tenga visible el estado del toggle desde el dashboard principal.
     *
     *   true  → 🟢 ACTIVO
     *   false → OFF
     *   null  → sin badge (DB no respondió o flag no seteado)
     */
    botV2Enabled?: boolean | null;
  } = {}
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Permite deep-link a un tab específico vía ?tab=crm (usado por
  // /admin/eventos/... → "Ver lead en CRM").
  const initialTab = (() => {
    const t = searchParams.get("tab");
    if (
      t === "resumen" ||
      t === "cursos" ||
      t === "alumnos" ||
      t === "inscripciones" ||
      t === "pagos" ||
      t === "crm" ||
      t === "bot" ||
      t === "futuro"
    ) {
      return t;
    }
    return "resumen";
  })();
  // ?leadId=... abre el drawer del lead correspondiente en el tab CRM.
  const initialLeadId = searchParams.get("leadId") ?? undefined;
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const realMode = isSupabaseConfigured();
    const u = getCurrentUser();
    if (realMode) {
      // Modo real: el middleware ya validó sesión admin. No usamos mock-auth aquí.
      // El saludo cae a un valor genérico si no hay sesión mock.
      if (u) setUser(u);
      setReady(true);
      return;
    }
    // Modo demo: flujo mock existente.
    if (!u) {
      router.push("/login");
      return;
    }
    if (u.role !== "admin" && u.role !== "instructor") {
      router.push("/dashboard");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  if (!ready) {
    // Skeleton durante el useEffect que resuelve `getCurrentUser()` +
    // `isSupabaseConfigured()`. Reemplaza el "Cargando panel…" plano
    // para que el flash pre-contenido se vea como una transición natural.
    // Mismo patrón que `src/app/admin/loading.tsx` (server skeleton del route).
    return (
      <Container size="wide" className="py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-72" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-brand-100 pb-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
        <p className="text-center text-ink-muted mt-10 text-sm">
          Cargando panel…
        </p>
      </Container>
    );
  }

  const courses = getAllCourses();
  const users = getAllUsers();
  const students = users.filter((u) => u.role === "student");
  const enrollments = getAllEnrollments();
  const payments = getAllPayments();
  const revenue = sumRevenue();
  const providers = listPaymentProviders();

  const avgProgress = enrollments.length
    ? Math.round(
        enrollments.reduce((a, e) => a + e.progressPercent, 0) / enrollments.length
      )
    : 0;

  const tabs: { id: Tab; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { id: "resumen", label: "Resumen", icon: BarChart3 },
    { id: "cursos", label: "Cursos", icon: School },
    { id: "alumnos", label: "Alumnos", icon: Users },
    { id: "inscripciones", label: "Inscripciones", icon: UserCog },
    { id: "pagos", label: "Pagos", icon: CreditCard },
    // FASE 8E (2026-07-21): gestión integral de pedidos de servicios.
    { id: "pedidos", label: "Pedidos", icon: ShoppingBag },
    { id: "crm", label: "CRM", icon: Magnet },
    // Sprint v16 (PR #1.7): pestaña de Nivel 1 para el buzón de conversaciones.
    { id: "conversations", label: "Conversaciones", icon: MessageCircle },
    { id: "bot", label: "Configuración Bot", icon: Bot },
    { id: "futuro", label: "Próximas integraciones", icon: Rocket }
  ];

  // FIX 2026-07-03 (sesion David, agujero de seguridad): si Supabase
  // esta configurado (modo real) pero la pagina server-side NO nos paso
  // adminEmail, es porque el middleware/bypass no se aplico y estamos
  // renderizando el panel sin sesion real. Mostramos un error claro en
  // vez de los mocks (que es lo que David veia).
  if (isSupabaseConfigured() && !adminEmail) {
    return (
      <Container size="wide" className="py-20">
        <Card className="p-8 text-center max-w-md mx-auto">
          <div className="mb-4 inline-flex justify-center h-12 w-12 items-center rounded-full bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-ink mb-2">Sesion requerida</h1>
          <p className="text-sm text-ink-muted mb-4">
            El panel admin no esta disponible sin una sesion valida.
            Redirigiendo al login...
          </p>
          <Button onClick={() => router.push("/admin/login")}>
            Ir al login
          </Button>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-ink-muted">Panel administrativo</p>
          <h1 className="text-3xl font-bold text-ink">
            Hola, {adminEmail ? adminEmail.split("@")[0] : user?.name?.split(" ")[0] ?? "admin"}
          </h1>
        </div>
        <Badge tone={user?.role === "admin" ? "brand" : "info"}>
          {(user?.role ?? "admin").toUpperCase()}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-brand-100 pb-3 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap " +
              (tab === t.id
                ? "bg-brand-500 text-white"
                : "text-ink-soft hover:bg-brand-50")
            }
          >
            <LucideIcon icon={t.icon} size="sm" tone="inherit" className="mr-1.5" />
            {t.label}
          </button>
        ))}
        <Link
          href="/admin/eventos"
          className="ml-auto px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap text-ink-soft hover:bg-brand-50 border border-brand-200"
        >
          <LucideIcon icon={Ticket} size="sm" tone="inherit" className="inline mr-1.5" /> Eventos →
        </Link>
        {/* FIX 2026-07-11 (Sprint v15 PR #1): el botón legacy "🧠 Bot v2 →"
            se eliminó. Ahora el toggle del bot vive dentro de la pestaña
            "🤖 Configuración Bot" (tab id "bot") que renderiza <BotConfigTab />.
            El badge ON/OFF se muestra en el header del BotConfigTab. */}
      </div>

      {/* ----------------------- RESUMEN ----------------------- */}
      {tab === "resumen" && (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Alumnos"
              value={students.length}
              hint={`${users.length} usuarios totales`}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Cursos activos"
              value={courses.filter((c) => c.status !== "proximamente").length}
              hint={`${courses.length} en catálogo`}
              icon={<School className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard
              label="Ingresos (aprobado)"
              value={formatMXN(revenue.approvedMXN)}
              hint={`${formatMXN(revenue.pendingMXN)} pendiente`}
              icon={<Wallet className="h-5 w-5" />}
              tone="neutral"
            />
            <StatCard
              label="Progreso promedio"
              value={`${avgProgress}%`}
              hint={`${enrollments.length} inscripciones`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-4">Top cursos por alumnos</h3>
              <ul className="space-y-3">
                {courses
                  .map((c) => ({
                    course: c,
                    count: countEnrollmentsByCourse(c.id)
                  }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map(({ course, count }) => (
                    <li key={course.id} className="flex items-center justify-between text-sm">
                      <span className="text-ink-soft">{course.title}</span>
                      <Badge tone="brand">{count} alumnos</Badge>
                    </li>
                  ))}
              </ul>
            </Card>
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-4">Estado de pagos (simulado)</h3>
              <ul className="space-y-3">
                {(["approved", "pending", "rejected"] as PaymentStatus[]).map((s) => {
                  const count = payments.filter((p) => p.status === s).length;
                  return (
                    <li key={s} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink-soft">
                        <Badge tone={statusTone[s]}>{statusLabel[s]}</Badge>
                      </span>
                      <span className="font-semibold text-ink">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ----------------------- CURSOS ----------------------- */}
      {tab === "cursos" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-ink">Gestión de cursos</h2>
            <Button size="sm" variant="outline" disabled title="Función demo — no disponible en MVP">+ Nuevo curso (demo)</Button>
          </div>
          {courses.map((c) => {
            const stats = getCourseStats(c.id);
            const studentsCount = countEnrollmentsByCourse(c.id);
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="brand">{c.level}</Badge>
                      <Badge tone={c.status === "gratis" ? "success" : c.status === "proximamente" ? "info" : "neutral"}>
                        {c.status}
                      </Badge>
                      <span className="text-xs text-ink-muted">
                        {formatMXN(c.priceMXN)}
                      </span>
                    </div>
                    <h3 className="font-bold text-ink">{c.title}</h3>
                    <p className="text-sm text-ink-muted mt-1 line-clamp-2">{c.shortDescription}</p>
                    <p className="text-xs text-ink-muted mt-2">
                      {stats.totalModules} módulos · {stats.totalLessons} lecciones · {formatDuration(stats.totalMinutes)} · {studentsCount} alumnos
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button href={`/cursos/${c.slug}`} size="sm" variant="outline">Ver</Button>
                    <Button size="sm" variant="ghost" disabled title="Función demo — no disponible en MVP">Editar (demo)</Button>
                  </div>
                </div>
                {/* Módulos y lecciones */}
                <div className="mt-4 pt-4 border-t border-brand-50">
                  <p className="text-xs font-bold uppercase text-brand-600 mb-2">Estructura</p>
                  <ul className="space-y-1 text-sm">
                    {c.modules.map((m, mi) => (
                      <li key={m.id} className="flex items-center justify-between text-ink-soft">
                        <span>M{mi + 1}. {m.title.replace(/^Módulo \d+ · /, "")}</span>
                        <span className="text-xs text-ink-muted">{m.lessons.length} lecciones</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ----------------------- ALUMNOS ----------------------- */}
      {tab === "alumnos" && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-brand-50 flex justify-between items-center">
            <h2 className="text-xl font-bold text-ink">Alumnos</h2>
            <Button size="sm" variant="outline" disabled title="Función demo — no disponible en MVP">+ Invitar (demo)</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Alumno</th>
                  <th className="text-left px-5 py-3 font-semibold">Email</th>
                  <th className="text-left px-5 py-3 font-semibold">Inscrito en</th>
                  <th className="text-left px-5 py-3 font-semibold">Progreso</th>
                  <th className="text-left px-5 py-3 font-semibold">Rol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {users.map((u) => {
                  const userEnrollments = getAllEnrollments().filter((e) => e.userId === u.id);
                  const avg = userEnrollments.length
                    ? Math.round(userEnrollments.reduce((a, e) => a + e.progressPercent, 0) / userEnrollments.length)
                    : 0;
                  return (
                    <tr key={u.id} className="hover:bg-brand-50/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-8 w-8 rounded-full bg-brand-gradient text-white text-xs font-bold flex items-center justify-center">
                            {initials(u.name)}
                          </span>
                          <span className="font-semibold text-ink">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink-muted">{u.email}</td>
                      <td className="px-5 py-3 text-ink-muted">{userEnrollments.length} cursos</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={avg} className="w-20" />
                          <span className="text-xs text-ink-muted">{avg}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={u.role === "admin" ? "brand" : u.role === "instructor" ? "info" : "neutral"}>
                          {u.role}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------- INSCRIPCIONES ----------------------- */}
      {tab === "inscripciones" && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-brand-50">
            <h2 className="text-xl font-bold text-ink">Inscripciones</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Alumno</th>
                  <th className="text-left px-5 py-3 font-semibold">Curso</th>
                  <th className="text-left px-5 py-3 font-semibold">Origen</th>
                  <th className="text-left px-5 py-3 font-semibold">Progreso</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {enrollments.map((e) => {
                  const u = users.find((x) => x.id === e.userId);
                  const c = courses.find((x) => x.id === e.courseId);
                  return (
                    <tr key={e.id} className="hover:bg-brand-50/30">
                      <td className="px-5 py-3 font-medium text-ink">{u?.name ?? e.userId}</td>
                      <td className="px-5 py-3 text-ink-soft">{c?.title ?? e.courseId}</td>
                      <td className="px-5 py-3">
                        <Badge tone={e.source === "purchase" ? "brand" : e.source === "coupon" ? "accent" : e.source === "free" ? "success" : "neutral"}>
                          {e.source}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={e.progressPercent} className="w-20" />
                          <span className="text-xs text-ink-muted">{e.progressPercent}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink-muted">{formatDate(e.enrolledAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------- PAGOS ----------------------- */}
      {tab === "pagos" && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-brand-50 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-ink">Pagos (simulados)</h2>
              <p className="text-sm text-ink-muted">
                Total aprobado: <strong>{formatMXN(revenue.approvedMXN)}</strong> ·
                Pendiente: <strong>{formatMXN(revenue.pendingMXN)}</strong>
              </p>
            </div>
            <Badge tone="warning">Provider: mock</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Pago</th>
                  <th className="text-left px-5 py-3 font-semibold">Alumno</th>
                  <th className="text-left px-5 py-3 font-semibold">Curso</th>
                  <th className="text-left px-5 py-3 font-semibold">Método</th>
                  <th className="text-left px-5 py-3 font-semibold">Monto</th>
                  <th className="text-left px-5 py-3 font-semibold">Estado</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {payments.map((p) => {
                  const u = users.find((x) => x.id === p.userId);
                  const c = courses.find((x) => x.id === p.courseId);
                  return (
                    <tr key={p.id} className="hover:bg-brand-50/30">
                      <td className="px-5 py-3 font-mono text-xs text-ink-muted">{p.externalReference}</td>
                      <td className="px-5 py-3 font-medium text-ink">{u?.name ?? p.userId}</td>
                      <td className="px-5 py-3 text-ink-soft">{c?.title ?? p.courseId}</td>
                      <td className="px-5 py-3">
                        <Badge tone="neutral">{p.method}</Badge>
                      </td>
                      <td className="px-5 py-3 font-semibold text-ink">
                        {formatMXN(p.amountMXN - p.discountMXN)}
                        {p.discountMXN > 0 && (
                          <span className="text-xs text-ink-muted block">
                            desc: -{formatMXN(p.discountMXN)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-ink-muted">{formatDate(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------- CRM ----------------------- */}
      {tab === "crm" && <CRMView initialLeadId={initialLeadId} />}

      {/* ----------------------- Pedidos (FASE 8E) ----------------------- */}
      {tab === "pedidos" && <OrdersTab />}

      {/* Sprint v16 (PR #1.7): 💬 Conversaciones elevado a pestaña
          principal de Nivel 1. Reemplaza al subcomponente ConversationsView
          que vivía anidado dentro de CRMView (eliminado en PR #1.7). */}
      {tab === "conversations" && <ConversationsTab />}

      {/* ----------------------- CONFIGURACIÓN BOT (sprint v15) ----------------------- */}
      {tab === "bot" && <BotConfigTab />}

      {/* ----------------------- PRÓXIMAS INTEGRACIONES ----------------------- */}
      {tab === "futuro" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-ink mb-1">Próximas integraciones</h2>
            <p className="text-ink-muted mb-5">
              Lo que está preparado arquitectónicamente y se activa en las siguientes fases.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  phase: "Fase 1",
                  title: "Auth & DB real con Supabase",
                  body: "Reemplazar mock-auth por Supabase Auth y persistir cursos, inscripciones y progreso en Postgres.",
                  done: ["Tipos de dominio", "Capa de auth con misma firma", "Estructura de datos"]
                },
                {
                  phase: "Fase 2",
                  title: "Pagos reales en México",
                  body: "Activar Mercado Pago, Stripe o Conekta con webhooks y acceso automático por compra.",
                  done: ["Contrato PaymentProvider", "Stubs de los 3 proveedores", "Mock provider funcional"]
                },
                {
                  phase: "Fase 3",
                  title: "Video hosting profesional",
                  body: "Migrar de YouTube no listado a Cloudflare Stream o Mux con signed URLs y analíticas.",
                  done: ["Abstracción VideoProvider", "Stubs para 5 proveedores"]
                },
                {
                  phase: "Fase 4",
                  title: "Certificados, CRM y comunidad",
                  body: "Certificados PDF verificables, CRM con WhatsApp y email marketing. La base del CRM ya está disponible en la pestaña CRM.",
                  done: ["Modelo Certificate", "CRM + WhatsApp + Agente IA (demo)", "Foundation lista"]
                }
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-brand-100 p-5">
                  <Badge tone="brand" className="mb-2">{f.phase}</Badge>
                  <h3 className="font-bold text-ink">{f.title}</h3>
                  <p className="text-sm text-ink-muted mt-1">{f.body}</p>
                  <ul className="mt-3 space-y-1 text-xs text-emerald-700">
                    {f.done.map((d) => (
                      <li key={d} className="flex items-start gap-1"><Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-ink mb-3">Proveedores de pago disponibles</h3>
            <ul className="grid sm:grid-cols-2 gap-3">
              {providers.map((p) => (
                <li key={p.name} className="flex items-center justify-between rounded-lg border border-brand-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-ink">{p.displayName}</p>
                    <p className="text-xs text-ink-muted">
                      Métodos: {p.supportedMethods.join(", ")}
                    </p>
                  </div>
                  <Badge tone={p.name === "mock" ? "success" : "neutral"}>
                    {p.name === "mock" ? "Activo" : "Stub"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Container>
  );
}
