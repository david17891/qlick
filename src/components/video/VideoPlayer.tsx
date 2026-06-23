"use client";

import { useMemo } from "react";
import type { VideoAsset } from "@/types";
import { resolveEmbed, resolveThumbnail } from "@/lib/video/provider";

/**
 * Reproductor de video con abstracción de proveedor.
 *
 * Internamente usa getVideoProvider() según asset.provider.
 * El flujo YouTube (MVP) renderiza un iframe con youtube-nocookie.
 *
 * ⚠️ AVISO IMPORTANTE — privacidad de video (ver docs/VIDEO_STRATEGY.md):
 *  - YouTube "no listado" NO es protección real. Cualquiera con el enlace puede verlo.
 *  - Ocultar controles o "modestbranding" no impide copiar la URL del video.
 *  - Para privacidad real se requiere Vimeo+dominio, Cloudflare Stream o Mux (Fase 3).
 */

export function VideoPlayer({
  asset,
  title,
  className,
  posterFallback
}: {
  asset: VideoAsset;
  title: string;
  className?: string;
  posterFallback?: string;
}) {
  const embed = useMemo(() => resolveEmbed(asset), [asset]);
  const thumbnail = resolveThumbnail(asset) ?? posterFallback;

  return (
    <div
      className={
        "relative w-full aspect-video overflow-hidden rounded-2xl bg-black shadow-glow " +
        (className ?? "")
      }
    >
      {asset.provider === "custom" ? (
        // Asumimos MP4/HLS directo para custom.
        <video
          controls
          poster={thumbnail}
          className="h-full w-full"
          title={title}
        >
          <source src={embed.src} />
          Tu navegador no soporta la reproducción de video.
        </video>
      ) : (
        <iframe
          src={embed.src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}

      {/* Marca de agua discreta de marca (no protege el video). */}
      <div className="pointer-events-none absolute bottom-3 right-3 opacity-60">
        <span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/90">
          Qlick · clase
        </span>
      </div>
    </div>
  );
}

/** Placeholder de video para skeletons / estados de carga. */
export function VideoPlayerSkeleton() {
  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-2xl bg-brand-100 animate-pulse" />
  );
}
