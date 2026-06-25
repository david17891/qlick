"use client";

/**
 * Botones de acción admin sobre un masterclass_registration.
 *
 * Server Action: `adminUpdateRegistrationAction` (protegida con
 * requireAdmin()). Tras cada update, hace router.refresh() para que el
 * Server Component padre recargue los datos.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { adminUpdateRegistrationAction } from "@/app/actions/admin-masterclass";
import type {
  MasterclassRegistrationStatus,
  MasterclassAttendanceStatus,
  MasterclassCommercialStatus,
} from "@/types/masterclass";

interface Props {
  registrationId: string;
  currentAttendance: MasterclassAttendanceStatus;
  currentCommercial: MasterclassCommercialStatus;
  currentRegistration: MasterclassRegistrationStatus;
}

export function RegistrationActions({
  registrationId,
  currentAttendance,
  currentCommercial,
  currentRegistration,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // El wrapper añade registrationId; el caller solo pasa los campos opcionales.
  type Patch = Omit<
    Parameters<typeof adminUpdateRegistrationAction>[0],
    "registrationId"
  >;

  const update = (patch: Patch) => {
    startTransition(async () => {
      await adminUpdateRegistrationAction({ registrationId, ...patch });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* Asistencia */}
      <Button
        size="sm"
        variant={currentAttendance === "attended" ? "primary" : "outline"}
        disabled={pending}
        onClick={() => update({ attendanceStatus: "attended" })}
      >
        ✓ Asistió
      </Button>
      <Button
        size="sm"
        variant={currentAttendance === "no_show" ? "primary" : "outline"}
        disabled={pending}
        onClick={() => update({ attendanceStatus: "no_show" })}
      >
        ✗ No show
      </Button>

      {/* Comercial */}
      <Button
        size="sm"
        variant={currentCommercial === "interested" ? "primary" : "outline"}
        disabled={pending}
        onClick={() => update({ commercialStatus: "interested" })}
      >
        💡 Interesado
      </Button>
      <Button
        size="sm"
        variant={currentCommercial === "not_interested" ? "primary" : "outline"}
        disabled={pending}
        onClick={() => update({ commercialStatus: "not_interested" })}
      >
        🚫 No interesado
      </Button>
      <Button
        size="sm"
        variant={currentCommercial === "converted" ? "primary" : "outline"}
        disabled={pending}
        onClick={() => update({ commercialStatus: "converted" })}
      >
        🎉 Convertido
      </Button>

      {/* Registration status (cancelar) */}
      {currentRegistration !== "cancelled" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => update({ registrationStatus: "cancelled" })}
        >
          Cancelar registro
        </Button>
      )}
    </div>
  );
}