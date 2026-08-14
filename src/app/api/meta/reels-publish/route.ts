import { NextResponse } from "next/server";
import { checkStrictCronAuth } from "@/lib/api/cron-auth";
import { publishFacebookReelFile } from "@/lib/meta/facebook-reels-publisher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = checkStrictCronAuth(req, "META_REELS_TEST_SECRET");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  if (process.env.META_REELS_AUTOMATION_TEST !== "true") {
    return NextResponse.json(
      { ok: false, error: "automation_test_disabled" },
      { status: 409 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const title = form.get("title");
  const description = form.get("description");
  if (
    !(file instanceof File) ||
    typeof title !== "string" ||
    typeof description !== "string"
  ) {
    return NextResponse.json(
      { ok: false, error: "file_title_description_required" },
      { status: 400 },
    );
  }

  try {
    const result = await publishFacebookReelFile({
      data: new Uint8Array(await file.arrayBuffer()),
      title,
      description,
    });
    return NextResponse.json({ ok: true, file: file.name, ...result });
  } catch (error) {
    console.error("[api/meta/reels-publish]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
