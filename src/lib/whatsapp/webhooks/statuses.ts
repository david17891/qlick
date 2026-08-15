import type { WhatsAppMessageStatus } from "./types";

export interface MetaStatusError {
  code?: number;
  subcode?: number;
  type?: string;
  title?: string;
  message?: string;
  details?: string;
}

export interface MetaStatus {
  id: string;
  status: WhatsAppMessageStatus;
  recipientId?: string;
  timestamp?: string;
  error?: MetaStatusError;
}

function optionalString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().slice(0, maxLength);
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function parseError(value: unknown): MetaStatusError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as {
    code?: unknown;
    error_subcode?: unknown;
    subcode?: unknown;
    type?: unknown;
    title?: unknown;
    message?: unknown;
    error_data?: { details?: unknown };
  };
  const error: MetaStatusError = {
    code: optionalNumber(raw.code),
    subcode: optionalNumber(raw.error_subcode ?? raw.subcode),
    type: optionalString(raw.type),
    title: optionalString(raw.title),
    message: optionalString(raw.message),
    details: optionalString(raw.error_data?.details),
  };
  return Object.values(error).some((item) => item !== undefined) ? error : undefined;
}

/**
 * Extrae statuses de Meta sin copiar el payload completo ni cuerpos/PII.
 * Mantenerlo puro permite probar los errores de entrega sin llamar a Meta.
 */
export function extractStatuses(payload: unknown): MetaStatus[] {
  try {
    const p = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id?: unknown;
              status?: unknown;
              recipient_id?: unknown;
              timestamp?: unknown;
              errors?: unknown;
            }>;
          };
        }>;
      }>;
    };
    const out: MetaStatus[] = [];
    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          if (typeof status.id !== "string" || typeof status.status !== "string") continue;
          const firstError = Array.isArray(status.errors) ? status.errors[0] : undefined;
          out.push({
            id: status.id,
            status: status.status as WhatsAppMessageStatus,
            recipientId: optionalString(status.recipient_id, 100),
            timestamp: optionalString(status.timestamp, 40),
            error: parseError(firstError),
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

