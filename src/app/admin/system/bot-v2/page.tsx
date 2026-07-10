/**
 * /admin/system/bot-v2 — Panel admin para el interruptor dinámico
 * del Motor IA Socrático v2 (Sprint 2 sub-sprint 2.1).
 *
 * Server Component. Lee el estado actual del flag con prioridad:
 *   1) DB (`system_settings.deepseek_tools_enabled`)
 *   2) Fallback env var
 *   3) Default OFF
 *
 * Pasa el resultado al Client Component `BotV2Toggle` para la UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { ImmediateRedirect } from "@/components/auth/ImmediateRedirect";
import {
  readSystemSetting,
  KEY_DEEPSEEK_TOOLS_ENABLED
} from "@/lib/admin/system-settings-server";
import { BotV2Toggle } from "./BotV2Toggle";

export const metadata: Metadata = {
  title: "Sistema · Bot v2 Toggle | Admin Qlick",
  description: "Interruptor maestro para el Motor IA Socrático v2 (tool calling).",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/system/bot-v2" }
};

export const dynamic = "force-dynamic";

interface BotV2PageProps {}

export default async function BotV2AdminPage(_: BotV2PageProps) {
  const admin = await requireAdmin();
  if (!admin) {
    return <ImmediateRedirect to="/admin/login?returnUrl=%2Fadmin%2Fsystem%2Fbot-v2" />;
  }

  // Resolver el estado actual desde la DB. La función también cachea
  // internamente por 30s. Si la DB no responde, devuelve `null` y
  // caemos al fallback env var.
  let dbValue: boolean | null = null;
  let dbOk = true;
  try {
    const v = await readSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED);
    if (v === true) dbValue = true;
    else if (v === false) dbValue = false;
    else dbValue = null;
  } catch {
    dbOk = false;
    dbValue = null;
  }

  const envValue = process.env.DEEPSEEK_TOOLS_ENABLED === "true";
  const source: "db" | "env" | "default" =
    dbValue === true || dbValue === false ? "db" : envValue ? "env" : "default";
  const initialEnabled = dbValue ?? envValue;

  return (
    <>
      <Navbar />
      <main className="bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin" className="hover:text-ink">
              ← Panel principal
            </Link>
          </div>
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Sistema · Motor IA v2
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Bot v2 (Socratico + Captura de Leads)
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Interruptor maestro del{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
                deepseek_tools_enabled
              </code>
              . Al activarlo, el bot de WhatsApp usa la tool{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
                extract_and_save_contact_info
              </code>{" "}
              (function-calling nativo de DeepSeek) en lugar del pipeline
              determinista del Sprint 1.
            </p>
          </header>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  🧠 Motor IA Socrático y Captura de Leads v2 (
                  <code className="text-sm">extract-contact</code>)
                </h2>
                <Badge tone={initialEnabled ? "success" : "neutral"}>
                  {initialEnabled ? "ACTIVO" : "APAGADO"}
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="pt-4">
              <BotV2Toggle initialEnabled={initialEnabled} source={source} />
            </CardBody>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">
                Detalles tecnicos
              </h2>
            </CardHeader>
            <CardBody className="pt-2 text-sm text-slate-700 space-y-3">
              <p>
                <strong>Resolucion del flag (orden de prioridad):</strong>{" "}
                DB <code className="text-xs bg-slate-100 px-1 rounded">system_settings</code> &rarr;{" "}
                env var <code className="text-xs bg-slate-100 px-1 rounded">DEEPSEEK_TOOLS_ENABLED</code> &rarr;{" "}
                default OFF.
              </p>
              <p>
                <strong>Fuente actual del valor:</strong>{" "}
                <Badge tone="info">{source}</Badge>
                {!dbOk && (
                  <span className="ml-2 text-xs text-amber-700">
                    (DB no respondio, fallback a env var o default)
                  </span>
                )}
              </p>
              <p>
                <strong>Cache de lectura:</strong> 30s in-memory en el proceso
                del provider. Un toggle aqui se ve reflejado para el siguiente
                mensaje del bot (no requiere redeploy).
              </p>
              <p>
                <strong>Latencia agregada:</strong> ~5ms cold (cache miss) + 1
                query Supabase por PRIMARY KEY; 0ms hot (cache hit dentro del TTL).
                Bien dentro del budget &lt;2.5s del flujo conversacional.
              </p>
              <p>
                <strong>Plan de rollback:</strong> apagar el toggle desde este
                panel para volver al modo Sprint 1 en &lt;30s. No requiere
                git revert ni redeploy.
              </p>
            </CardBody>
          </Card>

          <Card className="border-amber-200">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">
                ⚠️ Antes de activar en produccion
              </h2>
            </CardHeader>
            <CardBody className="pt-2 text-sm text-slate-700">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Verificar que el evento activo en DB tiene{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">status = 'published'</code>{" "}
                  y <code className="text-xs bg-slate-100 px-1 rounded">promptBlock</code>{" "}
                  poblado (sin evento activo, el bot cae a mensajes
                  genericos).
                </li>
                <li>
                  Confirmar que la captura anterior (Sprint 1, regex
                  deterministas) esta funcionando bien — el nuevo tool
                  calling sera <strong>adicional</strong>, no destructivo.
                </li>
                <li>
                  Monitorear las primeras 200 conversaciones para validar
                  tasa de conversion &gt;40% (umbral aprobado para iteracion).
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </main>
      <Footer />
    </>
  );
}
