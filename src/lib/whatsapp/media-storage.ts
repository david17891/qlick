import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { IncomingWhatsAppMessage } from "./webhooks/types";

const DEFAULT_BUCKET = "whatsapp-media";
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

type MediaDescriptor = {
  kind: "image" | "document";
  id: string;
  mimeType?: string;
  sha256?: string;
};

function descriptor(message: IncomingWhatsAppMessage): MediaDescriptor | null {
  if (message.image?.id) {
    return { kind: "image", id: message.image.id, mimeType: message.image.mimeType, sha256: message.image.sha256 };
  }
  if (message.document?.id) {
    return { kind: "document", id: message.document.id, mimeType: message.document.mimeType, sha256: message.document.sha256 };
  }
  return null;
}

function errorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/WHATSAPP_CLOUD_ACCESS_TOKEN/i.test(text)) return "missing_meta_token";
  if (/size|large|15MB/i.test(text)) return "media_too_large";
  if (/sha/i.test(text)) return "sha256_mismatch";
  if (/upload/i.test(text)) return "storage_upload_failed";
  return "media_download_failed";
}

/**
 * Downloads an inbound Meta attachment into a private Supabase Storage bucket.
 * The original WhatsApp row is already persisted before this function runs;
 * failures are recorded and never block the bot response.
 */
export async function persistWhatsAppMediaAttachment(args: {
  supabase: SupabaseClient<Database>;
  message: IncomingWhatsAppMessage;
}): Promise<{ ok: boolean; attachmentId?: string; status: string }> {
  const media = descriptor(args.message);
  if (!media || !args.message.messageId) return { ok: false, status: "not_applicable" };

  const bucket = process.env.WHATSAPP_MEDIA_BUCKET?.trim() || DEFAULT_BUCKET;
  const { data: existing } = await args.supabase
    .from("whatsapp_media_attachments" as never)
    .select("id, status")
    .eq("whatsapp_message_id" as never, args.message.messageId as never)
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; status: string };
    return { ok: row.status === "stored", attachmentId: row.id, status: row.status };
  }

  const { data: inserted, error: insertError } = await args.supabase
    .from("whatsapp_media_attachments" as never)
    .insert({
      whatsapp_message_id: args.message.messageId,
      meta_media_id: media.id,
      media_kind: media.kind,
      storage_bucket: bucket,
      mime_type: media.mimeType ?? null,
      sha256: media.sha256 ?? null,
      status: "pending",
    } as never)
    .select("id")
    .maybeSingle();
  if (insertError && (insertError as { code?: string }).code !== "23505") {
    return { ok: false, status: "failed" };
  }

  const attachmentId = (inserted as { id?: string } | null)?.id;
  try {
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
    if (!token) throw new Error("WHATSAPP_CLOUD_ACCESS_TOKEN missing");
    const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v20.0";
    const mediaResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(media.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mediaResponse.ok) throw new Error(`meta_media_lookup_${mediaResponse.status}`);
    const mediaInfo = (await mediaResponse.json()) as { url?: string; mime_type?: string; file_size?: number; sha256?: string };
    if (!mediaInfo.url) throw new Error("meta_media_url_missing");
    if (typeof mediaInfo.file_size === "number" && mediaInfo.file_size > MAX_RECEIPT_BYTES) {
      throw new Error("media_too_large");
    }
    const fileResponse = await fetch(mediaInfo.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileResponse.ok) throw new Error(`meta_media_download_${fileResponse.status}`);
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (bytes.byteLength > MAX_RECEIPT_BYTES) throw new Error("media_too_large");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const expectedSha = media.sha256 ?? mediaInfo.sha256;
    if (expectedSha && expectedSha !== digest) throw new Error("sha256_mismatch");
    const mimeType = mediaInfo.mime_type ?? media.mimeType ?? "application/octet-stream";
    const extension = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const path = `receipts/${new Date().toISOString().slice(0, 7)}/${args.message.messageId.replace(/[^A-Za-z0-9_-]/g, "_")}.${extension}`;
    const upload = await args.supabase.storage.from(bucket).upload(path, Buffer.from(bytes), {
      contentType: mimeType,
      upsert: false,
    });
    if (upload.error) throw new Error("storage_upload_failed");
    const { error: updateError } = await args.supabase
      .from("whatsapp_media_attachments" as never)
      .update({ status: "stored", storage_path: path, mime_type: mimeType, byte_size: bytes.byteLength, sha256: digest, stored_at: new Date().toISOString() } as never)
      .eq("whatsapp_message_id" as never, args.message.messageId as never);
    if (updateError) throw new Error("attachment_metadata_update_failed");
    return { ok: true, attachmentId, status: "stored" };
  } catch (error) {
    await args.supabase
      .from("whatsapp_media_attachments" as never)
      .update({ status: "failed", error_code: errorCode(error) } as never)
      .eq("whatsapp_message_id" as never, args.message.messageId as never);
    return { ok: false, attachmentId, status: "failed" };
  }
}
