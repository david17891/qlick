/**
 * Abstracción de proveedor de video.
 *
 * Permite cambiar de YouTube (MVP) a Vimeo, Cloudflare Stream, Mux o un host
 * privado sin tocar los componentes de UI. Ver docs/VIDEO_STRATEGY.md.
 *
 * IMPORTANTE — sobre YouTube "no listado":
 *  - Sirve para demos y fase inicial.
 *  - NO es una protección real: cualquiera con el enlace puede verlo y re-subirlo.
 *  - Los controles que ocultamos en la UI no impiden la copia técnica del enlace.
 */

import type { VideoAsset, VideoProvider as ProviderName } from "@/types";

export interface EmbedResult {
  /** URL lista para usar en <iframe src>. */
  src: string;
  /** Permite saber si la integración admite controles ocultos. */
  supportsControlsParam: boolean;
  /** Permite autoplay, modestbranding, etc. */
  extraParams?: Record<string, string>;
}

export interface VideoProvider {
  readonly name: ProviderName;
  /** Construye la URL de embed a partir del VideoAsset. */
  buildEmbed(asset: VideoAsset): EmbedResult;
  /** Obtiene una miniatura si el proveedor la provee. */
  thumbnailUrl?(asset: VideoAsset): string | undefined;
  /** Indica si el contenido requiere restricción por dominio/signed URL. */
  requiresSignedUrl: boolean;
}

/* ----------------------------- YouTube ----------------------------- */

function parseYouTubeId(source: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = source.match(p);
    if (m) return m[1];
  }
  return null;
}

export const youtubeProvider: VideoProvider = {
  name: "youtube",
  requiresSignedUrl: false,
  buildEmbed(asset) {
    const id = parseYouTubeId(asset.source) ?? asset.source;
    // rel=0   → no mostrar videos relacionados al final
    // modestbranding=1 → reducir branding de YouTube
    // controls=1 → mantenemos controles por usabilidad (ver docs)
    // AVISO: ocultar controles no impide copiar el enlace.
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1"
    });
    return {
      src: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
      supportsControlsParam: true,
      extraParams: { rel: "0", modestbranding: "1" }
    };
  },
  thumbnailUrl(asset) {
    const id = parseYouTubeId(asset.source) ?? asset.source;
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }
};

/* ------------------------------ Vimeo ------------------------------ */

export const vimeoProvider: VideoProvider = {
  name: "vimeo",
  requiresSignedUrl: false,
  buildEmbed(asset) {
    const id = asset.source.replace(/[^\d]/g, "");
    // Vimeo soporta restricción por dominio desde el panel de privacidad.
    return {
      src: `https://player.vimeo.com/video/${id}?byline=0&portrait=0&title=0`,
      supportsControlsParam: true
    };
  }
};

/* ------------------------ Cloudflare Stream ------------------------ */

export const cloudflareStreamProvider: VideoProvider = {
  name: "cloudflare_stream",
  requiresSignedUrl: true,
  buildEmbed(asset) {
    // Requiere CUSTOMER_CODE y video UID. En fase 3 se firma la URL en backend.
    const customerCode =
      process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || "CUSTOMER_CODE";
    return {
      src: `https://customer-${customerCode}.cloudflarestream.com/${asset.source}/iframe`,
      supportsControlsParam: false
    };
  }
};

/* ------------------------------- Mux ------------------------------- */

export const muxProvider: VideoProvider = {
  name: "mux",
  requiresSignedUrl: true,
  buildEmbed(asset) {
    return {
      src: `https://stream.mux.com/play/${asset.source}.m3u8`,
      supportsControlsParam: false
    };
  }
};

/* ------------------------------ Custom ----------------------------- */

export const customProvider: VideoProvider = {
  name: "custom",
  requiresSignedUrl: false,
  buildEmbed(asset) {
    return { src: asset.source, supportsControlsParam: false };
  }
};

/* ----------------------------- Registry ---------------------------- */

const PROVIDERS: Record<ProviderName, VideoProvider> = {
  youtube: youtubeProvider,
  vimeo: vimeoProvider,
  cloudflare_stream: cloudflareStreamProvider,
  mux: muxProvider,
  custom: customProvider
};

export function getVideoProvider(name: ProviderName): VideoProvider {
  return PROVIDERS[name] ?? youtubeProvider;
}

export function resolveEmbed(asset: VideoAsset): EmbedResult {
  return getVideoProvider(asset.provider).buildEmbed(asset);
}

export function resolveThumbnail(asset: VideoAsset): string | undefined {
  const provider = getVideoProvider(asset.provider);
  return (
    asset.posterImageUrl ??
    (provider.thumbnailUrl ? provider.thumbnailUrl(asset) : undefined)
  );
}
