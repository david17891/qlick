"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Event } from "@/types/events";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { EventDrawer } from "./EventDrawer";
import type { AdminEventSummary } from "@/lib/events/events-server";

/**
 * Wrapper Client para /admin/eventos.
 *
 * Recibe los summaries (cargados server-side por el page.tsx) y maneja:
 * - Botón "Nuevo evento" que abre el drawer en modo create.
 * - Botones "Editar" / "Archivar" en cada card.
 *
 * Tras cada save, llama router.refresh() para que el Server Component padre
 * recargue summaries y la UI se mantenga sincronizada con la DB.
 */
export function AdminEventosClient({
  initialSummaries
}: {
  initialSummaries: AdminEventSummary[];
}) {
  const router = useRouter();
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<Event | null>(null);

  function openCreate() {
    setDrawerEvent(null);
    setDrawerMode("create");
  }

  function openEdit(e: Event) {
    setDrawerEvent(e);
    setDrawerMode("edit");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerEvent(null);
  }

  function handleSaved() {
    router.refresh();
  }

  if (initialSummaries.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-4">
          <Button onClick={openCreate}>+ Nuevo evento</Button>
        </div>
        <Card className="p-8">
          <EmptyState
            title="Aún no hay eventos"
            description="Crea el primer evento con el botón de arriba."
          />
        </Card>
        {drawerMode && (
          <EventDrawer
            mode={drawerMode}
            event={drawerEvent}
            onClose={closeDrawer}
            onSaved={handleSaved}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Nuevo evento</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialSummaries.map((s) => (
          <Card key={s.event.id} className="p-0 flex flex-col overflow-hidden">
            {s.event.coverImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={s.event.coverImageUrl}
                alt={`Portada de ${s.event.title}`}
                className="w-full h-32 object-cover bg-brand-50"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-32 bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center text-brand-300 text-xs">
                sin portada
              </div>
            )}
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-2">
                <Badge
                  tone={
                    s.event.status === "published"
                      ? "success"
                      : s.event.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {s.event.status === "published"
                    ? "Publicado"
                    : s.event.status === "draft"
                      ? "Borrador"
                      : "Archivado"}
                </Badge>
                <span className="text-xs text-ink-muted">/{s.event.slug}</span>
              </div>
              <h2 className="font-bold text-ink text-lg leading-tight mb-1">
                {s.event.title}
              </h2>
              {s.event.description && (
                <p className="text-sm text-ink-soft line-clamp-2 mb-3">
                  {s.event.description}
                </p>
              )}
            <ul className="text-xs text-ink-muted space-y-0.5 mb-4">
              <li>
                📅 {formatDate(s.event.startsAt)}
                {s.event.endsAt && (
                  <span className="text-ink-muted">
                    {" "}— {formatDate(s.event.endsAt)}
                  </span>
                )}
              </li>
              {s.event.location && <li>📍 {s.event.location}</li>}
            </ul>
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <div className="rounded-lg bg-brand-50/60 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Confirmados</p>
                <p className="text-lg font-bold text-ink">
                  {s.confirmationCount}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Asistentes</p>
                <p className="text-lg font-bold text-emerald-700">
                  {s.attendeeCount}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Encuestas</p>
                <p className="text-lg font-bold text-amber-700">
                  {s.surveyCount}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Leads nuevos</p>
                <p className="text-lg font-bold text-blue-700">
                  {s.leadsPromoted}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(s.event)}
              >
                Editar
              </Button>
              <Link href={`/admin/eventos/${s.event.id}`} className="contents">
                <Button variant="primary" size="sm">
                  Ver detalle
                </Button>
              </Link>
            </div>
            </div>
          </Card>
        ))}
      </div>
      {drawerMode && (
        <EventDrawer
          mode={drawerMode}
          event={drawerEvent}
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}