/** Reglas puras para separar seguimiento nuevo de rescate histórico. */

export const HISTORICAL_INFO_RECOVERY_TAG = "recovery:info_historical";

export interface NewLeadInfoScopeInput {
  createdAt: string | null | undefined;
  tags: string[] | null | undefined;
  newInfoFollowupSince: string | null | undefined;
}

/**
 * Un lead solo entra al seguimiento de información nuevo si fue creado desde
 * el corte operativo y no pertenece a la campaña histórica. Ante fechas
 * inválidas, se excluye: la seguridad gana a la cobertura.
 */
export function isNewLeadInfoFollowupScope(input: NewLeadInfoScopeInput): boolean {
  if ((input.tags ?? []).includes(HISTORICAL_INFO_RECOVERY_TAG)) return false;
  const createdAt = Date.parse(input.createdAt ?? "");
  const since = Date.parse(input.newInfoFollowupSince ?? "");
  return Number.isFinite(createdAt) && Number.isFinite(since) && createdAt >= since;
}
