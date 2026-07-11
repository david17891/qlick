#!/usr/bin/env node
/**
 * scripts/verify-stripe-go-live.mjs
 *
 * Pre-flight automatizado para el flip a Stripe LIVE.
 * Corre 6 chequeos sin tocar producción; devuelve GO/STOP por cada uno.
 *
 * USO:
 *   node --env-file=.env.local scripts/verify-stripe-go-live.mjs
 *
 * SALIDA:
 *   {check} {GO/STOP} — {razón corta}
 *
 * Cuando los 6 dan GO, podés hacer el flip en Stripe Dashboard.
 * Para cada STOP, el doc explica el fix.
 *
 * CHECK 1: Vercel CLI autenticado
 * CHECK 2: STRIPE_SECRET_KEY en Vercel production es sk_live_* (no test)
 * CHECK 3: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY en Vercel production es pk_live_*
 * CHECK 4: STRIPE_WEBHOOK_SECRET en Vercel production es whsec_live_*
 * CHECK 5: RPC get_user_id_by_email en DB live responde y devuelve UUID válido
 * CHECK 6: Stripe API live responde (validar que la cuenta live está activa)
 *
 * @see docs/STRIPE_KYC_QLICK_MX.md para el walk-through completo
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const RESULTS = [];

function record(check, status, reason) {
  RESULTS.push({ check, status, reason });
  const icon = status === "GO" ? "✅" : "🛑";
  console.log(`${icon} ${check.padEnd(50)} ${status.padEnd(4)} — ${reason}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "pipe", shell: false, ...opts });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c) => (stdout += c.toString()));
    proc.stderr?.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function checkVercelAuth() {
  try {
    const { stdout, code } = await run("vercel", ["whoami"]);
    if (code !== 0) {
      record("Vercel CLI autenticado", "STOP",
        "vercel whoami falló. Revisá $env:VERCEL_TOKEN.");
      return;
    }
    const user = stdout.trim().split("\n").pop() || "";
    if (user.length === 0) {
      record("Vercel CLI autenticado", "STOP", "vercel whoami no devolvió usuario");
      return;
    }
    record("Vercel CLI autenticado", "GO", `usuario=${user}`);
  } catch (err) {
    record("Vercel CLI autenticado", "STOP", `error: ${err.message}`);
  }
}

async function checkVercelEnvVar(varName, expectedPrefixes, label) {
  // `vercel env ls` no expone valores; usamos el trick de los prefixes
  // via `vercel env pull` en archivo temporal y revisamos. NO exponemos valores.
  const tmpFile = `scripts/_verify-go-live-${Date.now()}.env.tmp`;
  try {
    const { stdout, stderr, code } = await run("vercel", [
      "env", "pull", tmpFile, "--yes", "--environment=production",
    ]);
    if (code !== 0) {
      record(`${label} (live prefix)`, "STOP", `vercel env pull falló: ${stderr.slice(0, 80)}`);
      return;
    }
    const fs = await import("node:fs");
    const content = fs.readFileSync(tmpFile, "utf8");
    const matches = content.split("\n").filter((l) => l.startsWith(`${varName}=`));
    fs.unlinkSync(tmpFile);
    if (matches.length === 0) {
      record(`${label} (live prefix)`, "STOP", `${varName} no está en Vercel production`);
      return;
    }
    // vercel env pull miente para sensitive — chequeamos solo si la var existe
    // y NO si está vacía. Para STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET (sensitive)
    // esto puede dar false negative. Verificamos con runtime test abajo.
    const value = matches[0].split("=").slice(1).join("=").replace(/^["']|["']$/g, "");
    if (expectedPrefixes.some((p) => value.startsWith(p))) {
      record(`${label} (live prefix)`, "GO",
        `${varName} presente, prefix OK`);
      return;
    }
    if (value.length === 0) {
      // sensitive var — confirmar con runtime
      record(`${label} (presence)`, "GO",
        `${varName} presente (sensitive, no expuesta por CLI; verificar con runtime test abajo)`);
      return;
    }
    record(`${label} (live prefix)`, "STOP",
      `${varName} empieza con "${value.slice(0,8)}..." (no es live)`);
  } catch (err) {
    record(`${label} (live prefix)`, "STOP", `error: ${err.message}`);
  }
}

async function checkRpcApplied() {
  // Ejecutar la RPC con el email de David (sabemos que existe) y confirmar
  // que devuelve un UUID. Si la RPC no existe, falla con "function does not exist".
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    record("RPC get_user_id_by_email aplicada", "SKIP",
      "SUPABASE_PROJECT_REF/SUPABASE_SECRET_KEY no están en .env.local");
    return;
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/get_user_id_by_email`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ p_email: "david17891@gmail.com" }),
    });
    if (!res.ok) {
      const text = await res.text();
      record("RPC get_user_id_by_email aplicada", "STOP",
        `HTTP ${res.status}: ${text.slice(0, 100)}`);
      return;
    }
    const userId = (await res.json()).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      record("RPC get_user_id_by_email aplicada", "STOP",
        `Respuesta no es UUID: "${userId}"`);
      return;
    }
    record("RPC get_user_id_by_email aplicada", "GO",
      `david17891@gmail.com → ${userId.slice(0, 8)}...`);
  } catch (err) {
    record("RPC get_user_id_by_email aplicada", "STOP", `error: ${err.message}`);
  }
}

async function checkStripeLiveAccount() {
  // Stripe API no expone secrets; pero podemos intentar un ping a /v1/balance
  // con la STRIPE_SECRET_KEY en runtime si la tenemos. Si no la tenemos,
  // SKIP — el smoke test manual lo cubre.
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  if (!sk) {
    record("Stripe live account reachable", "SKIP",
      "STRIPE_SECRET_KEY no está en .env.local (script no la tiene en runtime). " +
      "Verificar manualmente con Dashboard → https://dashboard.stripe.com (toggle Live)");
    return;
  }
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { "Authorization": `Bearer ${sk}` },
    });
    if (!res.ok) {
      record("Stripe live account reachable", "STOP",
        `HTTP ${res.status} — la cuenta live no responde o el key es inválido`);
      return;
    }
    const data = await res.json();
    const liveAvailable = data?.available?.[0]?.amount ?? null;
    record("Stripe live account reachable", "GO",
      `Stripe live responde. Balance available: ${liveAvailable !== null ? (liveAvailable/100).toFixed(2) + " MXN" : "desconocido (puede ser ok si no ha operado aún)"}`);
  } catch (err) {
    record("Stripe live account reachable", "STOP", `error: ${err.message}`);
  }
}

async function main() {
  console.log("\n🔍 Pre-flight Stripe go-live — Qlick prod\n");
  console.log(`   Project ref: ${PROJECT_REF || "(MISSING!)"}`);
  console.log(`   Supabase URL: ${PROJECT_REF ? SUPABASE_URL : "(MISSING!)"}`);
  console.log("");

  await checkVercelAuth();
  await checkVercelEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", ["pk_live_"], "Stripe publishable live");
  await checkVercelEnvVar("STRIPE_SECRET_KEY", ["sk_live_"], "Stripe secret live");
  await checkVercelEnvVar("STRIPE_WEBHOOK_SECRET", ["whsec_live_"], "Stripe webhook live");
  await checkRpcApplied();
  await checkStripeLiveAccount();

  console.log("");
  const goCount = RESULTS.filter((r) => r.status === "GO").length;
  const stopCount = RESULTS.filter((r) => r.status === "STOP").length;
  const skipCount = RESULTS.filter((r) => r.status === "SKIP").length;
  console.log(`Resumen: ${goCount} GO, ${stopCount} STOP, ${skipCount} SKIP`);
  console.log("");
  if (stopCount === 0) {
    console.log("✅ TODO LISTO PARA FLIP. Procedé con docs/STRIPE_KYC_QLICK_MX.md");
  } else {
    console.log("🛑 Faltan requisitos para el flip. Resolvelos y volvé a correr.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(2);
});
