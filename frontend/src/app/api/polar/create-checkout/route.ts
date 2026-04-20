import { NextResponse } from "next/server";
import { getUserIdFromBearer } from "@/lib/auth-bearer";
import { getPolarProductIds, polarRequest } from "@/lib/polar-config";
import { getServiceSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type PlanKey = "pro" | "team";

export async function POST(req: Request) {
  try {
    const auth = await getUserIdFromBearer(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    const plan = body.plan as PlanKey;
    if (plan !== "pro" && plan !== "team") {
      return NextResponse.json({ error: "plan must be pro or team" }, { status: 400 });
    }

    const { pro, team } = getPolarProductIds();
    const productId = plan === "pro" ? pro : team;
    if (!productId) {
      return NextResponse.json({ error: "Polar product id not configured" }, { status: 500 });
    }

    const successUrl = process.env.POLAR_SUCCESS_URL?.trim();
    if (!successUrl) {
      return NextResponse.json({ error: "POLAR_SUCCESS_URL not set" }, { status: 500 });
    }

    const supabase = getServiceSupabase();
    const { data: row, error: uerr } = await supabase
      .from("users")
      .select("email")
      .eq("id", auth.userId)
      .limit(1)
      .maybeSingle();
    if (uerr) {
      return NextResponse.json({ error: uerr.message }, { status: 500 });
    }
    const customerEmail =
      row && typeof (row as { email?: string }).email === "string"
        ? (row as { email: string }).email
        : undefined;

    const payload: Record<string, unknown> = {
      products: [productId],
      metadata: { user_id: auth.userId, plan },
      success_url: successUrl,
    };
    if (customerEmail) payload.customer_email = customerEmail;

    const created = await polarRequest<Record<string, unknown>>("/checkouts/", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const checkoutUrl =
      typeof created.url === "string"
        ? created.url
        : created.checkout &&
            typeof created.checkout === "object" &&
            typeof (created.checkout as { url?: string }).url === "string"
          ? (created.checkout as { url: string }).url
          : null;

    if (!checkoutUrl) {
      return NextResponse.json({ error: "Polar did not return checkout url" }, { status: 502 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[polar/create-checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
