#!/usr/bin/env python3
"""
Limpia @ts-ignore + casts (`as any`, `as never`) stale en el webhook
de Stripe, asumiendo que el typegen de Supabase ya esta regenerado y
cubre event_payments, event_access, payments.course_id, etc.

Solo toca lineas con @ts-ignore explicito que documentan "typegen
stale". Los `as never` en el query builder los deja (mas invasivo,
mejor analizar uno por uno en sprint futuro).
"""
import sys
from pathlib import Path

ROUTE = Path(r"C:\Users\User\Documents\Click\src\app\api\webhooks\stripe\route.ts")

raw = ROUTE.read_bytes()
# Normalizar a LF para matching (archivo esta en CRLF).
text = raw.decode("utf-8").replace("\r\n", "\n")
original_len = len(text)

# 1. event_payments insert block (lineas ~575-595) — quitar
#    @ts-ignore de "no esta en el typegen" + `as never` en from().
old = """    const { data: evPayment, error: evPayErr } = await supabase
      // @ts-ignore — event_payments no esta en el typegen (migration 20260715120000).
      .from("event_payments" as never)
      .insert({"""
new = """    const { data: evPayment, error: evPayErr } = await supabase
      .from("event_payments")
      .insert({"""
if old in text:
    text = text.replace(old, new)
    print("OK 1: event_payments insert — @ts-ignore + as never quitados")
else:
    print("FAIL 1: patron no encontrado")

# 2. payments insert (lineas ~620-650) — quitar @ts-ignore "course_id nullable"
#    + `as any` en el payload.
old = """    const { data: coursePayment, error: payErr } = await supabase
      .from("payments")
      // @ts-ignore — payments.course_id es nullable en DB (migration 20260707110000)
      // pero el typegen local aún dice NOT NULL.
      .insert({
        user_id: userId,
        course_id: productRef.kind === "course" ? productRef.id : null,
        provider: "stripe",
        external_reference: session.id,
        amount_mxn: amountTotalMXN,
        discount_mxn: 0,
        currency: "MXN",
        status: "approved" as PaymentStatus,
        method: detectMethodFromSession(session),
        idempotency_key: idempotencyKey,
      } as any)
      .select("id")
      .single();"""
new = """    const { data: coursePayment, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        course_id: productRef.kind === "course" ? productRef.id : null,
        provider: "stripe",
        external_reference: session.id,
        amount_mxn: amountTotalMXN,
        discount_mxn: 0,
        currency: "MXN",
        status: "approved" as PaymentStatus,
        method: detectMethodFromSession(session),
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();"""
if old in text:
    text = text.replace(old, new)
    print("OK 2: payments insert course — @ts-ignore + as any quitados")
else:
    print("FAIL 2: patron no encontrado")

# 3. payments insert (lineas ~905-930) — rejected por timeout/expiration.
old = """  const { data: payment, error: payErr } = await supabase
    .from("payments")
    // @ts-ignore — payments.course_id es nullable en DB (migration 20260707110000).
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "rejected" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    } as any)
    .select("id")"""
new = """  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "rejected" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    })
    .select("id")"""
if old in text:
    text = text.replace(old, new)
    print("OK 3: payments insert rejected — @ts-ignore + as any quitados")
else:
    print("FAIL 3: patron no encontrado")

# 4. payments insert (lineas ~960-985) — expired.
old = """  const { error: payErr } = await supabase
    .from("payments")
    // @ts-ignore — payments.course_id nullable (migration 20260707110000).
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "expired" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    } as any);"""
new = """  const { error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "expired" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    });"""
if old in text:
    text = text.replace(old, new)
    print("OK 4: payments insert expired — @ts-ignore + as any quitados")
else:
    print("FAIL 4: patron no encontrado")

# 5. event_payments select (lineas ~1030-1040) — buscar payment por external_reference.
old = """    const { data: evPay } = await supabase
      // @ts-ignore — event_payments no esta en el typegen.
      .from("event_payments" as never)
      .select("id, confirmation_id, amount_mxn, status")
      .eq("external_reference", externalRef)
      .maybeSingle();"""
new = """    const { data: evPay } = await supabase
      .from("event_payments")
      .select("id, confirmation_id, amount_mxn, status")
      .eq("external_reference", externalRef)
      .maybeSingle();"""
if old in text:
    text = text.replace(old, new)
    print("OK 5: event_payments select external_reference — limpio")
else:
    print("FAIL 5: patron no encontrado")

# 6. event_payments update (lineas ~1062-1072) — marcar refunded.
old = """    await supabase
      // @ts-ignore — event_payments no esta en el typegen.
      .from("event_payments" as never)
      .update({ status: "refunded" } as never)
      .eq("id", paymentId as never);"""
new = """    await supabase
      .from("event_payments")
      .update({ status: "refunded" })
      .eq("id", paymentId);"""
if old in text:
    text = text.replace(old, new)
    print("OK 6: event_payments update refunded — limpio")
else:
    print("FAIL 6: patron no encontrado")

# 7. event_access select (lineas ~1083-1093) — buscar access por payment_id.
old = """    const { data: eventAccess } = await (supabase
      // @ts-ignore — typegen aún sin event_access.
      .from("event_access") as any)
      .select("id, user_id, event_id")
      .eq("payment_id", paymentId)
      .eq("access_status", "active")
      .maybeSingle();"""
new = """    const { data: eventAccess } = await supabase
      .from("event_access")
      .select("id, user_id, event_id")
      .eq("payment_id", paymentId)
      .eq("access_status", "active")
      .maybeSingle();"""
if old in text:
    text = text.replace(old, new)
    print("OK 7: event_access select — limpio")
else:
    print("FAIL 7: patron no encontrado")

# Escribir de vuelta con CRLF (mantener convencion del repo Windows).
ROUTE.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
print(f"\nOriginal: {original_len} bytes")
print(f"Final:    {len(text)} bytes")
print(f"Delta:    {original_len - len(text)} bytes (removed)")
