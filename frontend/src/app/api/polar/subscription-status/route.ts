import { NextResponse } from "next/server";
import { getUserIdFromBearer } from "@/lib/auth-bearer";
import { readUserRow, syncUserPlanFromPolar } from "@/lib/polar-users-sync";
import { getServiceSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const auth = await getUserIdFromBearer(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (auth.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceSupabase();
    const row = await readUserRow(supabase, userId);
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentPlan = await syncUserPlanFromPolar(userId, row.email, row.plans);
    return NextResponse.json({ currentPlan, plans: currentPlan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[polar/subscription-status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
