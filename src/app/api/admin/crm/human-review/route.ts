import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  getHumanReviewQueue,
  HUMAN_REVIEW_CAUSES,
  HUMAN_REVIEW_OUTCOMES,
  recordHumanReview,
  deleteLeadFromHumanReview,
  type HumanReviewCause,
  type HumanReviewOutcome,
} from "@/lib/crm/human-review-server";

export const dynamic = "force-dynamic";

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function adminGuard(): Promise<{ email: string } | NextResponse> {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({ ok: true, demo: true, queue: null });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });
  return admin;
}

export async function GET() {
  const guard = await adminGuard();
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ ok: true, demo: false, queue: await getHumanReviewQueue() });
  } catch (error) {
    console.error("[api/admin/crm/human-review] GET error", error);
    return NextResponse.json({ ok: false, error: "No se pudo cargar la cola de revisión humana." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await adminGuard();
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const outcome = typeof body.outcome === "string" ? body.outcome as HumanReviewOutcome : "" as HumanReviewOutcome;
  const probableCause = typeof body.probableCause === "string" ? body.probableCause as HumanReviewCause : "" as HumanReviewCause;
  const botImprovement = typeof body.botImprovement === "string" ? body.botImprovement : "";
  const reviewerNote = typeof body.reviewerNote === "string" ? body.reviewerNote : "";
  if (!UUID_LIKE.test(leadId) || !HUMAN_REVIEW_OUTCOMES.includes(outcome) || !HUMAN_REVIEW_CAUSES.includes(probableCause) || !botImprovement.trim()) {
    return NextResponse.json({ ok: false, error: "Datos de revisión inválidos o incompletos." }, { status: 400 });
  }

  const result = await recordHumanReview({ leadId, outcome, probableCause, botImprovement, reviewerNote, actorEmail: guard.email });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard();
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (!UUID_LIKE.test(leadId) || body.confirm !== true) {
    return NextResponse.json({ ok: false, error: "Confirma el borrado permanente del lead." }, { status: 400 });
  }

  const result = await deleteLeadFromHumanReview({ leadId, actorEmail: guard.email });
  if (!result.ok) return NextResponse.json(result, { status: result.notFound ? 404 : 400 });
  return NextResponse.json(result);
}
