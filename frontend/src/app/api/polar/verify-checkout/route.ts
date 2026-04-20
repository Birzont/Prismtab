import { NextResponse } from "next/server";
import { getUserIdFromBearer } from "@/lib/auth-bearer";
import { applyCheckoutToUser, fetchPolarCheckout } from "@/lib/polar-users-sync";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const checkoutId = url.searchParams.get("checkout_id");
    if (!checkoutId) {
      return NextResponse.json({ error: "checkout_id is required" }, { status: 400 });
    }

    const auth = await getUserIdFromBearer(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const checkout = await fetchPolarCheckout(checkoutId);
    const result = await applyCheckoutToUser(checkout, auth.userId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      plan: result.plan,
      paid: result.paid,
      userId: result.userId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[polar/verify-checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
