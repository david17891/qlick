# Revisión humana de conversaciones CRM

## Objetivo

La pestaña **Revisión humana** de `/admin?tab=crm` concentra los casos donde una lectura de contexto puede recuperar una oportunidad o mejorar el bot. No envía WhatsApp automáticamente ni crea leads duplicados.

## Cómo se forma la cola

La cola se calcula sobre conversaciones reales de WhatsApp y los estados reales del lead:

- **Prioridad alta:** el último mensaje lo envió el lead, hay señal de inscripción/reserva/pago o existe una fricción de pago.
- **Prioridad media:** el último mensaje lo envió el bot/equipo y han pasado al menos 72 horas.
- **Señales adicionales:** solicitud de información, transferencia genérica a un asesor, mensajes salientes consecutivos, dato factual/fecha sospechosa o correo pendiente.

La causa mostrada es una hipótesis: `respuesta repetitiva o larga`, `transferencia genérica`, `faltó seguimiento`, `fricción de pago`, `faltan datos`, `intención baja`, `dato incorrecto` o `requiere lectura humana`.

## Flujo de trabajo

1. Abrir primero los casos de prioridad alta.
2. Leer los últimos seis mensajes y verificar el evento, el pago y el estado real del lead.
3. Elegir resultado: recuperable, no recuperable, requiere humano, ya resuelto, número incorrecto o no contactar.
4. Confirmar la causa probable y escribir una mejora concreta para el bot.
5. Registrar una nota interna, una interacción de sistema y un `admin_audit_log` con la decisión.
6. Si procede un contacto, hacerlo individualmente y registrar la respuesta; no lanzar campañas masivas desde esta vista.
7. Revisar semanalmente la distribución de causas para ajustar copy, cierre, fechas, pagos y escalamiento.

## Interpretación de marketing pendiente

`Marketing pendiente (etiqueta interna)` reemplaza la lectura ambigua de “sin consentimiento de marketing”. No afirma que la persona haya negado permiso. Significa que el CRM no tiene una captura explícita de consentimiento de marketing. El equipo debe diferenciar una respuesta operativa dentro del contexto conversacional de una campaña promocional.

## Persistencia y seguridad

- La revisión no borra ni archiva el lead automáticamente; el borrado manual tiene un control separado y confirmado.
- El correo que no fue proporcionado se guarda como `NULL`; no se fabrica `@placeholder.local`.
- La cola usa datos autenticados de Supabase y solo está disponible para administración.
- La retroalimentación no se muestra al lead ni se envía al bot como instrucción automática: primero se acumula y se revisa.

## WhatsApp, eventos y limpieza

- Cada caso con teléfono válido muestra **Abrir WhatsApp** para continuar la revisión en el chat real, sin enviar un mensaje automáticamente.
- La etiqueta del caso distingue `Evento actual`, `Evento anterior`, `Actual + anterior`, `Otro evento` o `Sin evento`. La asociación se calcula por vínculos CRM, asistentes y coincidencia de teléfono/correo con confirmaciones.
- **Eliminar lead y datos CRM** requiere confirmación del navegador y queda registrado como `lead_hard_deleted` en auditoría. El borrado elimina conversaciones, logs WhatsApp, tareas, notas, interacciones, campañas de recuperación, consentimiento y vínculos CRM.
- Confirmaciones, pagos, accesos, asistencias, certificados, pedidos de servicio y sus bitácoras se conservan como registros operativos; al eliminar el lead quedan desacoplados. Esto evita que una limpieza de pruebas rompa comprobantes o control de acceso.
