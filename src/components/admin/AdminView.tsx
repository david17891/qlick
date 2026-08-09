"use client";

import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@/types";
import { getCurrentUser } from "@/lib/auth/mock-auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Container, Card, Button, Badge, EmptyState, ProgressBar, Skeleton } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import {
  BarChart3,
  Bot,
  CreditCard,
  Database,
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
  Wallet,
  AlertTriangle
} from "lucide-react";
import { StatCard } from "@/components/dashboard";
import type { AdminDashboardSnapshot } from "@/lib/admin/admin-dashboard-server";
import { formatMXN, formatDate, initials } from "@/lib/utils";
import { CRMView } from "@/components/crm";
import { BotConfigTab } from "@/components/admin/BotConfigTab";
import { ConversationsTab } from "@/components/admin/ConversationsTab";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { DataMaintenanceTab } from "@/components/admin/DataMaintenanceTab";
import Link from "next/link";

type Tab = "resumen" | "cursos" | "alumnos" | "inscripciones" | "pagos" | "pedidos" | "servicios" | "crm" | "conversations" | "bot" | "futuro" | "mantenimiento";

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  approved: "success",
  paid: "success",
  paid_manual: "success",
  pending: "warning",
  processing: "warning",
  rejected: "danger",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "info",
  failed: "danger",
  disputed: "warning",
  suspicious_amount_discrepancy: "danger"
};

const statusLabel: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  expired: "Vencido",
  refunded: "Reembolsado",
  failed: "Falló",
  disputed: "En disputa",
  suspicious_amount_discrepancy: "Importe sospechoso",
  paid: "Pagado",
  paid_manual: "Pagado manual",
  processing: "Procesando",
  cancelled: "Cancelado"
};

export function AdminView(
  {
    adminEmail,
    botV2Enabled,
    dashboardData
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
    dashboardData: AdminDashboardSnapshot;
  }
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Permite deep-link a un tab específico vía ?tab=crm (usado por
  // /admin/eventos/... → "Ver lead en CRM").
  const initialTab = (() => {
    const t = searchParams.get("tab");
    if (
      t === "resumen" ||
      t === "pedidos" ||
      t === "servicios" ||
      t === "crm" ||
      t === "conversations" ||
      t === "bot" ||
      t === "futuro" ||
      t === "mantenimiento"
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
  const [pendingServicesCount, setPendingServicesCount] = useState<number>(0);

  useEffect(() => {
    async function checkPendingServices() {
      try {
        const res = await fetch("/api/admin/orders?status=pending_contact");
        const data = await res.json();
        if (data.ok && typeof data.total === "number") {
          setPendingServicesCount(data.total);
        }
      } catch {
        // silent fallback
      }
    }
    void checkPendingServices();
    const interval = setInterval(() => void checkPendingServices(), 12000);
    return () => clearInterval(interval);
  }, []);

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

  const realSnapshot = dashboardData.mode === "real" ? dashboardData : null;
  const courses = realSnapshot?.lms.courses ?? [];
  const students = realSnapshot?.lms.students ?? [];
  const enrollments = realSnapshot?.lms.enrollments ?? [];
  const payments = realSnapshot?.payments.rows ?? [];
  const avgProgress = realSnapshot?.lms.averageProgress ?? 0;
  const approvedRevenue = realSnapshot?.payments.approvedMXN ?? 0;
  const pendingRevenue = realSnapshot?.payments.pendingMXN ?? 0;
  const pendingPayments = realSnapshot?.payments.pendingCount ?? 0;

  const tabs: { id: Tab; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { id: "resumen", label: "Resumen", icon: BarChart3 },
    // FASE 8E / Servicios: gestión integral de leads y pedidos de servicios B2B.
    { id: "servicios", label: "Servicios", icon: ShoppingBag },
    { id: "crm", label: "CRM", icon: Magnet },
    // Sprint v16 (PR #1.7): pestaña de Nivel 1 para el buzón de conversaciones.
    { id: "conversations", label: "Conversaciones", icon: MessageCircle },
    { id: "bot", label: "Configuración Bot", icon: Bot },
    { id: "futuro", label: "Próximas integraciones", icon: Rocket },
    { id: "mantenimiento", label: "Auditoría y limpieza", icon: Database }
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
        <div className="flex items-center gap-2">
          {pendingServicesCount > 0 && (
            <button
              onClick={() => setTab("servicios")}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-400 bg-red-600 px-3.5 py-1 text-xs font-black text-white animate-pulse shadow-md transition hover:bg-red-700 active:scale-95"
            >
              <span>🚨 {pendingServicesCount} Cita(s) / Atención Pendiente</span>
            </button>
          )}
          <Badge tone={user?.role === "admin" ? "brand" : "info"}>
            {(user?.role ?? "admin").toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-brand-100 pb-3 overflow-x-auto">
        {tabs.map((t) => {
          const isServices = t.id === "servicios" || t.id === "pedidos";
          const isActive = tab === t.id || (isServices && tab === "servicios");
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap flex items-center gap-1.5 " +
                (isActive
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-ink-soft hover:bg-brand-50")
              }
            >
              <LucideIcon icon={t.icon} size="sm" tone="inherit" />
              <span>{t.label}</span>
              {isServices && pendingServicesCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white animate-pulse shadow-md">
                  🚨 {pendingServicesCount}
                </span>
              )}
            </button>
          );
        })}
        <Link
          href="/admin/eventos"
          className="ml-auto px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap text-ink-soft hover:bg-brand-50 border border-brand-200"
        >
          <LucideIcon icon={Ticket} size="sm" tone="inherit" className="inline mr-1.5" /> Eventos →
        </Link>
      </div>

      {/* Banner de Urgencia Global para Citas / Servicios Pendientes */}
      {pendingServicesCount > 0 && tab !== "servicios" && (
        <button
          onClick={() => setTab("servicios")}
          className="w-full mb-8 text-left flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-red-400 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-4.5 text-white shadow-xl transition hover:scale-[1.005] active:scale-[0.99] group"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl font-black animate-bounce shadow-inner">
              🚨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-[11px] font-black tracking-wider uppercase">
                  Atención Requerida
                </span>
                <span className="text-xs font-semibold text-red-100">
                  {pendingServicesCount} {pendingServicesCount === 1 ? "cita o solicitud urgente" : "citas o solicitudes urgentes"}
                </span>
              </div>
              <h3 className="font-display text-base font-extrabold mt-0.5">
                Tienes {pendingServicesCount} {pendingServicesCount === 1 ? "cita o contacto de servicio pendiente de atender" : "citas o contactos de servicio pendientes de atender"}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-red-700 shadow-md group-hover:bg-red-50 transition">
            <span>Entrar a Servicios ahora</span>
            <span>→</span>
          </div>
        </button>
      )}

      {/* ----------------------- RESUMEN ----------------------- */}
      {tab === "resumen" && (
        <div className="space-y-8">
          {dashboardData.warning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>Lectura parcial:</strong> {dashboardData.warning}
            </div>
          )}
          {dashboardData.mode !== "real" && (
            <EmptyState
              icon="🗄️"
              title="Datos administrativos no disponibles"
              description="El panel no muestra datos demo. Configura la conexión real de Supabase para consultar esta vista."
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Leads CRM"
              value={realSnapshot?.crm.totalLeads ?? 0}
              hint="registros reales"
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Eventos publicados"
              value={realSnapshot?.events.published ?? 0}
              hint={`${realSnapshot?.events.upcoming ?? 0} próximos`}
              icon={<School className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard
              label="Pagos aprobados"
              value={formatMXN(approvedRevenue)}
              hint={`${formatMXN(pendingRevenue)} pendiente`}
              icon={<Wallet className="h-5 w-5" />}
              tone="neutral"
            />
            <StatCard
              label="Pagos por revisar"
              value={pendingPayments}
              hint={`${realSnapshot?.events.confirmationsPendingPayment ?? 0} confirmaciones de evento`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="neutral"
            />
            <StatCard
              label="Leads con pago pendiente"
              value={realSnapshot?.crm.paymentPending ?? 0}
              hint="etapa actual del CRM"
              icon={<CreditCard className="h-5 w-5" />}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6 lg:col-span-2">
              <h3 className="font-bold text-ink mb-1">Estado de pagos reales</h3>
              <p className="text-xs text-ink-muted mb-4">Eventos y servicios · fuente: Supabase.</p>
              <ul className="space-y-3">
                {Object.entries(payments.reduce<Record<string, number>>((counts, payment) => {
                  counts[payment.status] = (counts[payment.status] ?? 0) + 1;
                  return counts;
                }, {})).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <Badge tone={statusTone[status] ?? "neutral"}>{statusLabel[status] ?? status}</Badge>
                    <span className="font-semibold text-ink">{count}</span>
                  </li>
                ))}
                {payments.length === 0 && <li className="text-sm text-ink-muted">Sin pagos registrados.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ----------------------- CURSOS ----------------------- */}
      {tab === "cursos" && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">Cursos del LMS</h2>
              <p className="text-sm text-ink-muted">Catálogo real de Supabase. Aquí no se muestran cursos demo.</p>
            </div>
            <Badge tone="info">{courses.filter((c) => c.status === "published").length} publicados · {courses.filter((c) => c.status === "proximamente").length} próximamente</Badge>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              icon="🎓"
              title="No hay cursos registrados"
              description="El catálogo LMS está vacío. Los eventos y servicios se administran en sus propias pestañas."
            />
          ) : courses.map((c) => {
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={c.status === "published" ? "success" : c.status === "proximamente" ? "info" : "neutral"}>
                        {c.status === "published" ? "Publicado" : c.status === "proximamente" ? "Próximamente" : c.status}
                      </Badge>
                      <span className="text-xs text-ink-muted">
                        {c.priceMXN === null ? "Precio no definido" : formatMXN(c.priceMXN)}
                      </span>
                    </div>
                    <h3 className="font-bold text-ink">{c.title}</h3>
                    <p className="text-xs text-ink-muted mt-2">
                      {c.moduleCount} módulos · {c.lessonCount} lecciones · {c.enrollmentCount} inscripciones
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button href={`/cursos/${c.slug}`} size="sm" variant="outline">Ver</Button>
                  </div>
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
            <div>
              <h2 className="text-xl font-bold text-ink">Alumnos con acceso LMS</h2>
              <p className="text-sm text-ink-muted">Usuarios reales con al menos una inscripción en Supabase.</p>
            </div>
            <Badge tone="info">{students.length} alumnos</Badge>
          </div>
          {students.length === 0 ? (
            <EmptyState title="Sin alumnos con inscripción" description="Todavía no hay accesos LMS reales para mostrar." />
          ) : <div className="overflow-x-auto">
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
                {students.map((u) => {
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
                      <td className="px-5 py-3 text-ink-muted">{u.enrollmentCount} cursos</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={u.progressPercent} className="w-20" />
                          <span className="text-xs text-ink-muted">{u.progressPercent}%</span>
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
          </div>}
        </Card>
      )}

      {/* ----------------------- INSCRIPCIONES ----------------------- */}
      {tab === "inscripciones" && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-brand-50">
            <h2 className="text-xl font-bold text-ink">Inscripciones LMS reales</h2>
            <p className="text-sm text-ink-muted mt-1">Fuente: tabla `enrollments` de Supabase.</p>
          </div>
          {enrollments.length === 0 ? (
            <EmptyState title="Sin inscripciones" description="Todavía no hay inscripciones LMS reales." />
          ) : <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Alumno</th>
                  <th className="text-left px-5 py-3 font-semibold">Curso</th>
                  <th className="text-left px-5 py-3 font-semibold">Estado</th>
                  <th className="text-left px-5 py-3 font-semibold">Progreso</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {enrollments.map((e) => {
                  return (
                    <tr key={e.id} className="hover:bg-brand-50/30">
                      <td className="px-5 py-3 font-medium text-ink">{e.userName}</td>
                      <td className="px-5 py-3 text-ink-soft">{e.courseTitle}</td>
                      <td className="px-5 py-3">
                        <Badge tone={e.status === "completed" ? "success" : e.status === "active" ? "brand" : "neutral"}>
                          {e.status}
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
          </div>}
        </Card>
      )}

      {/* ----------------------- PAGOS ----------------------- */}
      {tab === "pagos" && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-brand-50 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-ink">Pagos reales</h2>
              <p className="text-sm text-ink-muted">
                Eventos y servicios · aprobado: <strong>{formatMXN(approvedRevenue)}</strong> ·
                pendiente: <strong>{formatMXN(pendingRevenue)}</strong>
              </p>
            </div>
            <Badge tone="success">Fuente: Supabase</Badge>
          </div>
          {payments.length === 0 ? (
            <EmptyState title="Sin pagos registrados" description="Los pagos de eventos y servicios aparecerán aquí cuando exista un registro real." />
          ) : <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Origen</th>
                  <th className="text-left px-5 py-3 font-semibold">Referencia</th>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-5 py-3 font-semibold">Producto</th>
                  <th className="text-left px-5 py-3 font-semibold">Método</th>
                  <th className="text-left px-5 py-3 font-semibold">Monto</th>
                  <th className="text-left px-5 py-3 font-semibold">Estado</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {payments.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-brand-50/30">
                      <td className="px-5 py-3"><Badge tone={p.origin === "event" ? "brand" : "info"}>{p.origin === "event" ? "Evento" : "Servicio"}</Badge></td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-muted">{p.reference}</td>
                      <td className="px-5 py-3 font-medium text-ink">{p.customerName}</td>
                      <td className="px-5 py-3 text-ink-soft">{p.product}</td>
                      <td className="px-5 py-3">
                        <Badge tone="neutral">{p.method}</Badge>
                      </td>
                      <td className="px-5 py-3 font-semibold text-ink">
                        {formatMXN(p.amountMXN)}
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
          </div>}
        </Card>
      )}

      {/* ----------------------- CRM ----------------------- */}
      {tab === "crm" && <CRMView initialLeadId={initialLeadId} />}

      {/* ----------------------- Servicios (FASE 8E) ----------------------- */}
      {(tab === "servicios" || tab === "pedidos") && <OrdersTab />}

      {/* Sprint v16 (PR #1.7): 💬 Conversaciones elevado a pestaña
          principal de Nivel 1. Reemplaza al subcomponente ConversationsView
          que vivía anidado dentro de CRMView (eliminado en PR #1.7). */}
      {tab === "conversations" && <ConversationsTab />}

      {/* ----------------------- CONFIGURACIÓN BOT (sprint v15) ----------------------- */}
      {tab === "bot" && <BotConfigTab />}

      {/* ----------------------- AUDITORÍA Y LIMPIEZA ----------------------- */}
      {tab === "mantenimiento" && <DataMaintenanceTab />}

      {/* ----------------------- PRÓXIMAS INTEGRACIONES ----------------------- */}
      {tab === "futuro" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-ink mb-1">Estado real de la plataforma</h2>
            <p className="text-ink-muted mb-5">
              Esta vista distingue lo que ya está operativo de lo que todavía no existe. No representa stubs como si fueran integraciones activas.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { title: "Supabase", body: "Base de datos, autenticación administrativa y CRM operativo.", status: dashboardData.integrations.supabase === "active" ? "Activo" : "No disponible", tone: dashboardData.integrations.supabase === "active" ? "success" : "warning" },
                { title: "CRM + WhatsApp", body: "Leads reales, conversaciones, pausas, seguimiento y rescate automático.", status: dashboardData.integrations.whatsapp === "active" ? "Activo" : "Revisar configuración", tone: dashboardData.integrations.whatsapp === "active" ? "success" : "warning" },
                { title: "Pagos de eventos", body: "Stripe y pagos manuales viven en el flujo de eventos; no dependen del proveedor mock del LMS.", status: "Operativo", tone: "success" },
                { title: "Pagos de servicios", body: "Pedidos reales en `service_orders`; el checkout Stripe se vincula al pedido cuando corresponde.", status: "Operativo", tone: "success" },
                { title: "Correo transaccional", body: "Confirmaciones y notificaciones dependen de la configuración de Brevo.", status: dashboardData.integrations.brevo === "configured" ? "Configurado" : "No configurado", tone: dashboardData.integrations.brevo === "configured" ? "success" : "warning" },
                { title: "Stripe", body: "Disponible para los flujos que lo solicitan; el modo live/test depende del producto y sus reglas.", status: dashboardData.integrations.stripe === "configured" ? "Configurado" : "No configurado", tone: dashboardData.integrations.stripe === "configured" ? "success" : "warning" }
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-brand-100 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-ink">{item.title}</h3>
                    <Badge tone={item.tone as "success" | "warning"}>{item.status}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted mt-2">{item.body}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-ink mb-3">Pendientes reales</h3>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>• No hay integración de Google Calendar operativa; las citas demo no se muestran en modo real.</li>
              <li>• El LMS está desactivado por ahora: no hay cursos, alumnos, inscripciones ni pagos LMS operativos.</li>
              <li>• Mercado Pago y Conekta permanecen como adaptadores no activos hasta configurar y probar sus webhooks.</li>
              <li>• El proveedor mock queda reservado para simuladores y pruebas, fuera de esta vista operativa.</li>
            </ul>
          </Card>
        </div>
      )}
    </Container>
  );
}
