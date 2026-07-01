/**
 * Bot Context Store — CRUD de overrides manuales para bots.
 *
 * Permite a un operador humano override-iar partes del contexto del bot sin
 * tocar código. Los overrides se persisten en `public.bot_context_overrides`.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface BotContextOverride {
  id: string;
  botName: string;
  contextKey: string;
  contextValue: string;
  priority: number;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface CreateOverrideInput {
  botName?: string;
  contextKey: string;
  contextValue: string;
  priority?: number;
  enabled?: boolean;
  expiresAt?: Date | null;
  updatedBy?: string | null;
}

export interface UpdateOverrideInput {
  contextValue?: string;
  priority?: number;
  enabled?: boolean;
  expiresAt?: Date | null;
  updatedBy?: string | null;
}

type SupabaseAdmin = SupabaseClient<Database>;

const DEFAULT_BOT_NAME = "qlick-bot";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getSupabase(): Promise<SupabaseAdmin | null> {
  try {
    const { checkSupabaseConfig } = await import("../supabase/health");
    const { createSupabaseAdminClient } = await import("../supabase/admin");
    if (!checkSupabaseConfig().configured) return null;
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

interface RawRow {
  id: string;
  bot_name: string;
  context_key: string;
  context_value: string;
  priority: number;
  enabled: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

function mapRow(row: RawRow): BotContextOverride {
  return {
    id: row.id,
    botName: row.bot_name,
    contextKey: row.context_key,
    contextValue: row.context_value,
    priority: row.priority,
    enabled: row.enabled,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by
  };
}

/* ------------------------------------------------------------------ */
/*  API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lista todos los overrides de un bot (enabled o no).
 */
export async function listBotOverrides(
  botName: string = DEFAULT_BOT_NAME,
  options: { includeDisabled?: boolean } = {}
): Promise<BotContextOverride[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("bot_context_overrides" as never)
      .select("*")
      .eq("bot_name", botName)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });

    if (!options.includeDisabled) {
      query = query.eq("enabled", true);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as RawRow[]).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Carga los overrides activos (no expirados, enabled=true) ya ordenados por
 * prioridad. Devuelve solo lo necesario para construir el prompt.
 */
export async function loadActiveOverrides(
  botName: string = DEFAULT_BOT_NAME
): Promise<Array<{ key: string; value: string; priority: number }>> {
  const supabase = await getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .rpc("get_active_bot_overrides" as never, { p_bot_name: botName } as never);

    if (error || !data) return [];
    return (data as Array<{ context_key: string; context_value: string; priority: number }>).map(
      (r) => ({
        key: r.context_key,
        value: r.context_value,
        priority: r.priority
      })
    );
  } catch {
    return [];
  }
}

/**
 * Crea un override nuevo. Si ya existe (bot_name, context_key), actualiza.
 */
export async function upsertBotOverride(
  input: CreateOverrideInput
): Promise<BotContextOverride | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const row = {
    bot_name: input.botName ?? DEFAULT_BOT_NAME,
    context_key: input.contextKey,
    context_value: input.contextValue,
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
    expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    updated_by: input.updatedBy ?? null
  };

  try {
    const { data, error } = await supabase
      .from("bot_context_overrides" as never)
      .upsert(row as never, {
        onConflict: "bot_name,context_key"
      })
      .select("*")
      .maybeSingle();

    if (error || !data) return null;
    return mapRow(data as RawRow);
  } catch {
    return null;
  }
}

/**
 * Actualiza un override existente por (bot_name, context_key).
 */
export async function updateBotOverride(
  contextKey: string,
  patch: UpdateOverrideInput,
  botName: string = DEFAULT_BOT_NAME
): Promise<BotContextOverride | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const update: Record<string, unknown> = {};
  if (patch.contextValue !== undefined) update.context_value = patch.contextValue;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.expiresAt !== undefined) {
    update.expires_at = patch.expiresAt ? patch.expiresAt.toISOString() : null;
  }
  if (patch.updatedBy !== undefined) update.updated_by = patch.updatedBy;

  try {
    const { data, error } = await supabase
      .from("bot_context_overrides" as never)
      .update(update as never)
      .eq("bot_name", botName)
      .eq("context_key", contextKey)
      .select("*")
      .maybeSingle();

    if (error || !data) return null;
    return mapRow(data as RawRow);
  } catch {
    return null;
  }
}

/**
 * Borra un override por (bot_name, context_key).
 */
export async function deleteBotOverride(
  contextKey: string,
  botName: string = DEFAULT_BOT_NAME
): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("bot_context_overrides" as never)
      .delete()
      .eq("bot_name", botName)
      .eq("context_key", contextKey);

    return !error;
  } catch {
    return false;
  }
}