"""Limpia casts stale en ensure-event-confirmation.ts.

El typegen SÍ cubre event_confirmations con payment_status, email,
phone_raw, etc. Todos los `as never` y `as any` en este archivo son
stale.
"""
from pathlib import Path

F = Path(r"C:\Users\User\Documents\Click\src\lib\events\ensure-event-confirmation.ts")
raw = F.read_bytes()
text = raw.decode("utf-8").replace("\r\n", "\n")
original = text

# 1. Lookup by email
old = """    const { data: byEmail } = await supabase
      .from("event_confirmations" as never)
      .select("id, source, name, email, phone_normalized")
      .eq("event_id", eventId)
      .eq("email", email)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      // Cast through any porque el typegen no reconoce
      // payment_status en event_confirmations (migration
      // 20260714230000). La columna SI existe en DB.
      const conf = byEmail as any as {
        id: string;
        source: string;
      };
      return {
        confirmationId: conf.id,
        created: false,
        source: conf.source,
        paymentStatus: "paid",
      };
    }"""
new = """    const { data: byEmail } = await supabase
      .from("event_confirmations")
      .select("id, source, name, email, phone_normalized")
      .eq("event_id", eventId)
      .eq("email", email)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      return {
        confirmationId: byEmail.id,
        created: false,
        source: byEmail.source,
        paymentStatus: "paid",
      };
    }"""
if old in text:
    text = text.replace(old, new)
    print("OK 1: lookup by email — casts stale quitados")
else:
    print("FAIL 1")

# 2. Lookup by phone + update email
old = """      const { data: byPhone } = await supabase
        .from("event_confirmations" as never)
        .select("id, source, name, email, phone_normalized")
        .eq("event_id", eventId)
        .eq("phone_normalized", phoneNormalized)
        .order("confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone) {
        // Cast through any (mismo motivo que arriba).
        const conf = byPhone as any as {
          id: string;
          source: string;
        };
        // FIX: actualizar email si era placeholder y ahora tenemos el real.
        // Cast through any porque el typegen no reconoce la columna email
        // en byPhone (select solo trae id/source/name/email/phone_normalized
        // — pero el typegen devuelve never para este subset).
        const byPhoneAny = byPhone as any;
        if (email && (!byPhoneAny.email || !byPhoneAny.email.includes("@"))) {
          // Solo actualizamos email; payment_status ya lo setea el
          // caller downstream (webhook stripe lo hace via update
          // post-GRANT). Aqui solo arreglamos el email.
          await supabase
            .from("event_confirmations" as never)
            .update({ email } as never)
            .eq("id", conf.id as never);
        }
        return {
          confirmationId: conf.id,
          created: false,
          source: conf.source,
          paymentStatus: "paid",
        };
      }"""
new = """      const { data: byPhone } = await supabase
        .from("event_confirmations")
        .select("id, source, name, email, phone_normalized")
        .eq("event_id", eventId)
        .eq("phone_normalized", phoneNormalized)
        .order("confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone) {
        // FIX: actualizar email si era placeholder y ahora tenemos el real.
        if (email && (!byPhone.email || !byPhone.email.includes("@"))) {
          // Solo actualizamos email; payment_status ya lo setea el
          // caller downstream (webhook stripe lo hace via update
          // post-GRANT). Aqui solo arreglamos el email.
          await supabase
            .from("event_confirmations")
            .update({ email })
            .eq("id", byPhone.id);
        }
        return {
          confirmationId: byPhone.id,
          created: false,
          source: byPhone.source,
          paymentStatus: "paid",
        };
      }"""
if old in text:
    text = text.replace(old, new)
    print("OK 2: lookup by phone — casts stale quitados")
else:
    print("FAIL 2")

# 3. Insert new
old = """    const { data: created, error: insertErr } = await supabase
      .from("event_confirmations" as never)
      .insert({
        event_id: eventId,
        name: safeName,
        email,
        phone_normalized: safePhone,
        phone_raw: phoneRaw ?? null,
        source: source ?? "public_form",
        payment_status: paymentStatus ?? "paid"
      } as never)
      .select("id, source")
      .single();
    if (insertErr) {
      // 23505 = unique violation: otra confirmation con mismo
      // (event_id, phone_normalized). Buscar y retornar esa.
      if (insertErr.code === "23505" && safePhone) {
        const { data: fallback } = await supabase
          .from("event_confirmations" as never)
          .select("id, source")
          .eq("event_id", eventId)
          .eq("phone_normalized", safePhone)
          .limit(1)
          .maybeSingle();
        if (fallback) {
          const fb = fallback as any as {
            id: string;
            source: string;
          };
          return {
            confirmationId: fb.id,
            created: false,
            source: fb.source,
            paymentStatus: "paid",
          };
        }
      }
      errorLog("[ensureEventConfirmation] insert fallo", {
        eventId,
        email,
        code: insertErr.code,
        message: insertErr.message,
      });
      return null;
    }
    if (!created) return null;
    const c = created as any as {
      id: string;
      source: string;
    };
    return {
      confirmationId: c.id,
      created: true,
      source: c.source,
      paymentStatus: "paid",
    };"""
new = """    const { data: created, error: insertErr } = await supabase
      .from("event_confirmations")
      .insert({
        event_id: eventId,
        name: safeName,
        email,
        phone_normalized: safePhone,
        phone_raw: phoneRaw ?? null,
        source: source ?? "public_form",
        payment_status: paymentStatus ?? "paid",
      })
      .select("id, source")
      .single();
    if (insertErr) {
      // 23505 = unique violation: otra confirmation con mismo
      // (event_id, phone_normalized). Buscar y retornar esa.
      if (insertErr.code === "23505" && safePhone) {
        const { data: fallback } = await supabase
          .from("event_confirmations")
          .select("id, source")
          .eq("event_id", eventId)
          .eq("phone_normalized", safePhone)
          .limit(1)
          .maybeSingle();
        if (fallback) {
          return {
            confirmationId: fallback.id,
            created: false,
            source: fallback.source,
            paymentStatus: "paid",
          };
        }
      }
      errorLog("[ensureEventConfirmation] insert fallo", {
        eventId,
        email,
        code: insertErr.code,
        message: insertErr.message,
      });
      return null;
    }
    if (!created) return null;
    return {
      confirmationId: created.id,
      created: true,
      source: created.source,
      paymentStatus: "paid",
    };"""
if old in text:
    text = text.replace(old, new)
    print("OK 3: insert new — casts stale quitados")
else:
    print("FAIL 3")

# 4. Limpiar comentarios FIX typegen stale al inicio
old = """  // 1. Buscar por (event_id, email) primero.
  try {
    // FIX typegen stale: payment_status no aparece en
    // event_confirmations en el typegen local. Regenerar con
    // `supabase gen types typescript --local` cuando crucemos
    // el sprint de housekeeping. Por ahora, hacemos un select sin
    // payment_status y leemos ese campo via un query separado
    // cuando lo necesitamos downstream.
    const { data: byEmail } = await supabase"""
new = """  // 1. Buscar por (event_id, email) primero.
  try {
    const { data: byEmail } = await supabase"""
if old in text:
    text = text.replace(old, new)
    print("OK 4: comentario FIX typegen stale — quitado")
else:
    print("FAIL 4")

F.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
print(f"\nOriginal: {len(original)} bytes")
print(f"Final:    {len(text)} bytes")
print(f"Delta:    {len(original) - len(text)} bytes (removed)")
