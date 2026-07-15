"use client";

/**
 * ResetTestLeadButton — botón de "Olvidar TODO" para que David pueda
 * probar el bot desde cero entre cada prueba.
 *
 * Sprint 2026-07-15 (sesión Carlos, +52 1 653 293 5492): David
 * acumula 300+ filas de conversaciones del phone de testing y el
 * LLM arrastra contexto stale (nombres viejos como "Quiero",
 * catálogos de eventos ya archivados, etc.). Este botón borra
 * físicamente todas las filas ligadas al phone para que la próxima
 * interacción arranque como lead completamente nuevo.
 *
 * Llamadas al endpoint `/api/admin/bot/reset-test-lead` (POST).
 *
 * IMPORTANTE: usar SOLO con phones de testing. Si lo disparas contra
 * un lead real, se pierden conversaciones y attendees.
 */

import { useState } from "react";
import { Card, CardBody, CardHeader, Button, Input } from "@/components/ui";

interface ResetResult {
  ok: boolean;
  phone?: string;
  leadExisted?: boolean;
  deleted?: {
    conversations: number;
    attendees: number;
    confirmations: number;
    qrTokens: number;
    surveyInvitations: number;
    profiles: number;
    leads: number;
  };
  error?: string;
  note?: string;
}

const DEFAULT_TEST_PHONE = "+52 1 653 293 5492";

export function ResetTestLeadButton() {
  const [phone, setPhone] = useState<string>(DEFAULT_TEST_PHONE);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  async function handleReset() {
    if (!phone.trim()) {
      setResult({ ok: false, error: "Falta el phone." });
      return;
    }
    // Confirmación nativa (rápida y clara, sin modal custom).
    const ok = window.confirm(
      `¿Borrar TODO lo del phone "${phone}"?\n\n` +
        `Esto incluye conversaciones, attendees, profiles y el lead.\n` +
        `Es IRREVERSIBLE. Solo usar con phones de testing.`,
    );
    if (!ok) return;

    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/bot/reset-test-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const j = (await r.json().catch(() => ({}))) as ResetResult;
      setResult({ ...j, ok: r.ok && j.ok !== false });
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-ink">
          🧪 Reset Lead de Testing
        </h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-soft">
          Borra TODAS las filas del phone de testing (conversaciones,
          attendees, profiles, lead). Úsalo antes de cada prueba para
          que el bot arranque limpio.{" "}
          <strong className="text-red-600">Es IRREVERSIBLE.</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 1 653 293 5492"
              aria-label="Phone de testing a resetear"
            />
          </div>
          <Button
            onClick={handleReset}
            disabled={loading || !phone.trim()}
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Borrando..." : "🗑️ Olvidar todo"}
          </Button>
        </div>

        {result && (
          <div
            role="status"
            aria-live="polite"
            className={
              result.ok
                ? "rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
                : "rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            }
          >
            {result.ok && result.deleted ? (
              <>
                <strong>Reset completo.</strong>{" "}
                Filas borradas: conversaciones={result.deleted.conversations},
                attendees={result.deleted.attendees},
                confirmations={result.deleted.confirmations},
                qrTokens={result.deleted.qrTokens},
                profiles={result.deleted.profiles},
                leads={result.deleted.leads}.
                <br />
                <em>{result.note}</em>
              </>
            ) : (
              <strong>Error: {result.error ?? "desconocido"}</strong>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
