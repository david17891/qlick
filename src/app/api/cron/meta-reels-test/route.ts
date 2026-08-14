import { NextResponse } from "next/server";
import { checkStrictCronAuth } from "@/lib/api/cron-auth";
import { publishFacebookReel } from "@/lib/meta/facebook-reels-publisher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_REELS = [
  {
    file: "Q2.mp4",
    title: "Tu negocio también merece ser encontrado",
    description:
      "Tu negocio también merece ser encontrado. Una estrategia digital clara ayuda a atraer clientes y convertir visitas en oportunidades. En Qlick impulsamos negocios locales con marketing digital y automatización.\n\n#MarketingDigital #NegociosLocales #Mexicali",
  },
  {
    file: "Q3.mp4",
    title: "Haz que tu presencia digital trabaje por ti",
    description:
      "Haz que tu presencia digital trabaje por ti. Con contenido constante y campañas bien dirigidas, tu negocio puede llegar a más personas. En Qlick hacemos crecer negocios con marketing digital y Meta Ads.\n\n#MarketingDigital #MetaAds #Mexicali",
  },
] as const;

export async function POST(req: Request) {
  const auth = checkStrictCronAuth(req, "CRON_SECRET");
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

  const baseUrl =
    process.env.META_REELS_PUBLIC_BASE_URL ?? "https://qlick.digital";
  const results: Array<Record<string, unknown>> = [];

  for (const reel of TEST_REELS) {
    try {
      const published = await publishFacebookReel({
        fileUrl: `${baseUrl}/qlick-content-test/${reel.file}`,
        title: reel.title,
        description: reel.description,
      });
      results.push({ file: reel.file, ok: true, ...published });
    } catch (error) {
      results.push({
        file: reel.file,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ok = results.every((result) => result.ok === true);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
}
