"use server";
/**
 * Server Actions para el CRUD de ai_bot_rules.
 * Llamadas desde BotConfigTab (Client Component) en PR #1.
 *
 * @server
 */

import {
  createBotRule,
  updateBotRule,
  deleteBotRule,
  getActiveBotRules,
  type BotRule,
  type BotRuleMetadata,
  type BotRuleInsert,
  type BotRuleUpdate,
} from "./ai-bot-rules-server";
import { requireAdmin } from "@/lib/auth/session";

export interface ActionResult<T = BotRule> {
  ok: boolean;
  data?: T;
  error?: string;
}

function err(msg: string): ActionResult<never> {
  return { ok: false, error: msg };
}

export async function createBotRuleAction(
  input: Omit<BotRuleInsert, "created_by">
): Promise<ActionResult<BotRule>> {
  const admin = await requireAdmin();
  if (!admin) return err("No autorizado.");
  return createBotRule({ ...input, created_by: admin.email ?? "human_operator" });
}

export async function updateBotRuleAction(
  id: string,
  patch: BotRuleUpdate
): Promise<ActionResult<BotRule>> {
  const admin = await requireAdmin();
  if (!admin) return err("No autorizado.");
  return updateBotRule(id, patch);
}

export async function deleteBotRuleAction(id: string): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin) return err("No autorizado.");
  return deleteBotRule(id);
}

export async function toggleBotRuleAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<BotRule>> {
  return updateBotRuleAction(id, { is_active: isActive });
}

export async function fetchActiveRulesAction(): Promise<BotRule[]> {
  // Lectura abierta a operadores autenticados (no requiere admin) para que
  // la lista de reglas activas se pueda mostrar también en vistas de monitoreo.
  // El cache interno (30s) de la server lib evita martillar la DB.
  return getActiveBotRules();
}

export type { BotRule, BotRuleMetadata, BotRuleInsert, BotRuleUpdate };
