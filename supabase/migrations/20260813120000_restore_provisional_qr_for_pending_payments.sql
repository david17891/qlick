-- Hybrid event flow: pending payments keep a provisional QR.
--
-- The previous paid-event policy revoked tokens immediately after capture.
-- Do not touch refunds, disputes, manual revocations, or expired tokens:
-- only the exact reason written by that policy is reversible.
-- This is intentionally idempotent and does not send messages.

UPDATE public.event_qr_tokens AS t
SET
  revoked_at = NULL,
  revoked_reason = NULL
FROM public.event_confirmations AS c
JOIN public.events AS e ON e.id = c.event_id
WHERE t.confirmation_id = c.id
  AND t.revoked_reason = 'payment_pending_registration'
  AND c.registration_status = 'payment_pending'
  AND c.payment_status IN ('pending', 'pending_verification')
  AND COALESCE(e.price_mxn, 0) > 0;

