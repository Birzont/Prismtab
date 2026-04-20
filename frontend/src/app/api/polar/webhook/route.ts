import { NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { headersToRecord } from "@/lib/polar-config";
import {
  applyCheckoutToUser,
  applySubscriptionCanceled,
  applySubscriptionPaidState,
  normalizeCheckout,
} from "@/lib/polar-users-sync";

export const runtime = "edge";

function parseUnverifiedEvent(raw: string): { type: string; data: unknown } {
  const parsed = JSON.parse(raw) as { type?: string; data?: unknown };
  if (!parsed.type) throw new Error("missing type");
  return { type: parsed.type, data: parsed.data };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim() || "";

  let event: { type: string; data: unknown };
  try {
    if (secret) {
      const headers = headersToRecord(req.headers);
      event = validateEvent(raw, headers, secret) as { type: string; data: unknown };
    } else {
      console.warn("[polar/webhook] POLAR_WEBHOOK_SECRET unset — parsing body without signature verification");
      event = parseUnverifiedEvent(raw);
    }
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return new NextResponse("", { status: 403 });
    }
    console.error("[polar/webhook] parse error", e);
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    const t = event.type;
    const data = event.data;

    switch (t) {
      case "subscription.created":
      case "subscription.active":
      case "subscription.uncanceled": {
        await applySubscriptionPaidState(data);
        break;
      }
      case "subscription.updated": {
        const rawSub = data as Record<string, unknown>;
        const st = String(rawSub.status || "").toLowerCase();
        if (st === "active" || st === "trialing") {
          await applySubscriptionPaidState(data);
        } else if (
          st === "canceled" ||
          st === "unpaid" ||
          st === "incomplete_expired"
        ) {
          await applySubscriptionCanceled(data);
        }
        break;
      }
      case "subscription.canceled":
      case "subscription.revoked": {
        await applySubscriptionCanceled(data);
        break;
      }
      case "checkout.succeeded":
      case "checkout.updated": {
        const ch = normalizeCheckout(data);
        const st = (ch.status || "").toLowerCase();
        if (st === "succeeded") {
          await applyCheckoutToUser(ch, null);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[polar/webhook] handler error", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return new NextResponse("", { status: 202 });
}
