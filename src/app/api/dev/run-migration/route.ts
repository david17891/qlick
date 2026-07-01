/**
 * Endpoint DEBUG: ejecuta SQL arbitrario contra la DB de Supabase.
 *
 * SOLO PARA APLICAR MIGRACIONES PENDIENTES (one-shot). Se elimina después.
 *
 * Acceso: requiere `DEV_ADMIN_SECRET` en el body.
 *
 * ⚠️ PELIGRO: Este endpoint puede ejecutar CUALQUIER SQL contra la DB.
 * NO debe quedar en producción después de las migraciones.
 *
 * @server
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

interface RunRequest {
  secret?: string;
  sql?: string;
  label?: string;
}

interface RunResult {
  ok: boolean;
  rows?: unknown[];
  rowCount?: number;
  duration_ms: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RunRequest;
  const expected = process.env.DEV_ADMIN_SECRET ?? "";
  if (!expected || body.secret !== expected) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const sql = body.sql?.trim();
  if (!sql) {
    return NextResponse.json(
      { ok: false, message: "Missing 'sql' in body" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const password = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !password) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Supabase no configurado (NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY vacíos)"
      },
      { status: 500 }
    );
  }

  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/);
  if (!m) {
    return NextResponse.json(
      { ok: false, message: "URL de Supabase con formato inválido" },
      { status: 500 }
    );
  }
  const ref = m[1];
  const host = `db.${ref}.supabase.co`;

  const client = new Client({
    host,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30_000,
    query_timeout: 30_000
  });

  const start = Date.now();
  try {
    await client.connect();
    const result = await client.query(sql);
    const duration = Date.now() - start;
    const out: RunResult = {
      ok: true,
      rows: result.rows,
      rowCount: result.rowCount ?? undefined,
      duration_ms: duration
    };
    return NextResponse.json(out);
  } catch (err) {
    const duration = Date.now() - start;
    const out: RunResult = {
      ok: false,
      error:
        err instanceof Error
          ? `${err.message}\n${(err as { detail?: string }).detail ?? ""}`
          : String(err),
      duration_ms: duration
    };
    return NextResponse.json(out, { status: 500 });
  } finally {
    await client.end().catch(() => undefined);
  }
}
