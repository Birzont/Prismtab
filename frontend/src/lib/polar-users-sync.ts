import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolarProductIds, polarRequest } from "./polar-config";
import { getServiceSupabase } from "./supabase-admin";

export type PlanTier = "free" | "pro" | "team";

function planFromProductId(productId: string | null | undefined): PlanTier | null {
  if (!productId) return null;
  const { pro, team } = getPolarProductIds();
  if (pro && productId === pro) return "pro";
  if (team && productId === team) return "team";
  return null;
}

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = meta[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export async function resolveUserId(
  supabase: SupabaseClient,
  opts: {
    metadataUserId?: string | null;
    customerEmail?: string | null;
    externalCustomerId?: string | null;
  },
): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;
  if (opts.externalCustomerId) return opts.externalCustomerId;
  const email = opts.customerEmail?.trim().toLowerCase();
  if (!email) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1);
  if (error || !data?.[0]?.id) return null;
  return data[0].id as string;
}

/** 유료: plans + verified. 무료: plans 만 (verified 유지) */
export async function updateUserPlan(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanTier,
  paid: boolean,
): Promise<{ error: Error | null }> {
  const patch: Record<string, string> = { plans: plan };
  if (paid && (plan === "pro" || plan === "team")) {
    patch.verified = "verified";
  }
  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  return { error: error ? new Error(error.message) : null };
}

type PolarList<T> = { items?: T[] };

type PolarSubscription = {
  id: string;
  status: string;
  product_id: string;
  metadata?: Record<string, unknown>;
};

type PolarCustomer = {
  id: string;
  email?: string | null;
  external_id?: string | null;
};

function pickHighestPlan(plans: PlanTier[]): PlanTier {
  const order: PlanTier[] = ["free", "pro", "team"];
  let best: PlanTier = "free";
  for (const p of plans) {
    if (order.indexOf(p) > order.indexOf(best)) best = p;
  }
  return best;
}

/** Polar 구독 목록에서 active/trialing 중 pro/team 판별 → 최종 플랜 */
export function currentPlanFromSubscriptions(
  subs: PolarSubscription[],
): PlanTier {
  const paid: PlanTier[] = [];
  for (const s of subs) {
    const st = (s.status || "").toLowerCase();
    if (st !== "active" && st !== "trialing") continue;
    const p = planFromProductId(s.product_id);
    if (p) paid.push(p);
  }
  if (paid.length === 0) return "free";
  return pickHighestPlan(paid);
}

export async function listPolarCustomersByEmail(
  email: string,
): Promise<PolarCustomer[]> {
  const q = encodeURIComponent(email);
  const res = await polarRequest<PolarList<PolarCustomer>>(
    `/customers?email=${q}&limit=20`,
    { method: "GET" },
  );
  return res.items || [];
}

export async function listPolarSubscriptionsForCustomer(
  customerId: string,
): Promise<PolarSubscription[]> {
  const q = encodeURIComponent(customerId);
  const res = await polarRequest<PolarList<PolarSubscription>>(
    `/subscriptions?customer_id=${q}&limit=100`,
    { method: "GET" },
  );
  return res.items || [];
}

export type CheckoutPayload = {
  id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  product?: { id?: string } | null;
  customer_email?: string | null;
  external_customer_id?: string | null;
};

export function normalizeCheckout(raw: unknown): CheckoutPayload {
  const x = raw as Record<string, unknown>;
  const product = x.product;
  let p: { id?: string } | null = null;
  if (product && typeof product === "object") {
    const o = product as Record<string, unknown>;
    if (typeof o.id === "string") p = { id: o.id };
  }
  const meta = x.metadata;
  const metadata =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  const email =
    typeof x.customer_email === "string"
      ? x.customer_email
      : typeof x.customerEmail === "string"
        ? x.customerEmail
        : null;
  const ext =
    typeof x.external_customer_id === "string"
      ? x.external_customer_id
      : typeof x.externalCustomerId === "string"
        ? x.externalCustomerId
        : null;
  return {
    id: typeof x.id === "string" ? x.id : undefined,
    status: String(x.status || ""),
    metadata,
    product: p,
    customer_email: email,
    external_customer_id: ext,
  };
}

export async function fetchPolarCheckout(checkoutId: string): Promise<CheckoutPayload> {
  const raw = await polarRequest<unknown>(`/checkouts/${checkoutId}`, { method: "GET" });
  return normalizeCheckout(raw);
}

export async function applyCheckoutToUser(
  checkoutRaw: unknown,
  expectedUserId?: string | null,
): Promise<{ userId: string | null; plan: PlanTier; paid: boolean; error?: string }> {
  const checkout = normalizeCheckout(checkoutRaw);
  const supabase = getServiceSupabase();
  const metaUid = metaString(checkout.metadata, "user_id");
  const metaPlan = metaString(checkout.metadata, "plan");
  if (expectedUserId && metaUid && metaUid !== expectedUserId) {
    return { userId: null, plan: "free", paid: false, error: "checkout user mismatch" };
  }
  const productId = checkout.product?.id || null;
  let target: PlanTier | null = planFromProductId(productId);
  if (!target && (metaPlan === "pro" || metaPlan === "team")) target = metaPlan;

  const st = (checkout.status || "").toLowerCase();
  const succeeded = st === "succeeded";
  if (!succeeded || !target) {
    return { userId: null, plan: "free", paid: false, error: "checkout not succeeded or unknown product" };
  }

  const uid = await resolveUserId(supabase, {
    metadataUserId: metaUid,
    customerEmail: checkout.customer_email,
    externalCustomerId: checkout.external_customer_id,
  });
  if (!uid) return { userId: null, plan: "free", paid: false, error: "user not resolved" };

  const paid = target === "pro" || target === "team";
  const { error } = await updateUserPlan(supabase, uid, target, paid);
  if (error) return { userId: uid, plan: target, paid, error: error.message };
  return { userId: uid, plan: target, paid };
}

function subProductId(sub: Record<string, unknown>): string {
  const a = sub.productId;
  const b = sub.product_id;
  if (typeof a === "string") return a;
  if (typeof b === "string") return b;
  return "";
}

function subMetadata(sub: Record<string, unknown>): Record<string, unknown> {
  const m = sub.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) return m as Record<string, unknown>;
  return {};
}

function subCustomer(sub: Record<string, unknown>): {
  email: string | null;
  externalId: string | null;
} {
  const c = sub.customer;
  if (!c || typeof c !== "object") return { email: null, externalId: null };
  const o = c as Record<string, unknown>;
  const email = typeof o.email === "string" ? o.email : null;
  const ext =
    typeof o.externalId === "string"
      ? o.externalId
      : typeof o.external_id === "string"
        ? o.external_id
        : null;
  return { email, externalId: ext };
}

function subStatus(sub: Record<string, unknown>): string {
  return String(sub.status || "").toLowerCase();
}

export async function applySubscriptionPaidState(
  sub: unknown,
): Promise<{ userId: string | null; plan: PlanTier; skipped?: string }> {
  const supabase = getServiceSupabase();
  const raw = sub as Record<string, unknown>;
  const st = subStatus(raw);
  if (st !== "active" && st !== "trialing") {
    return { userId: null, plan: "free", skipped: "not active" };
  }
  const productId = subProductId(raw);
  const target = planFromProductId(productId);
  const meta = subMetadata(raw);
  const metaPlan = metaString(meta, "plan");
  let plan: PlanTier | null = target;
  if (!plan && (metaPlan === "pro" || metaPlan === "team")) plan = metaPlan;

  if (!plan || plan === "free") {
    return { userId: null, plan: "free", skipped: "unknown product" };
  }

  const cust = subCustomer(raw);
  const uid = await resolveUserId(supabase, {
    metadataUserId: metaString(meta, "user_id"),
    customerEmail: cust.email,
    externalCustomerId: cust.externalId,
  });
  if (!uid) return { userId: null, plan: "free", skipped: "user not resolved" };

  await updateUserPlan(supabase, uid, plan, true);
  return { userId: uid, plan };
}

export async function applySubscriptionCanceled(
  sub: unknown,
): Promise<{ userId: string | null; skipped?: string }> {
  const supabase = getServiceSupabase();
  const raw = sub as Record<string, unknown>;
  const meta = subMetadata(raw);
  const uid = metaString(meta, "user_id");
  if (!uid) return { userId: null, skipped: "no metadata user_id" };
  await updateUserPlan(supabase, uid, "free", false);
  return { userId: uid };
}

/** Polar ↔ DB 동기화 후 users.plans 읽기 */
export async function syncUserPlanFromPolar(
  userId: string,
  userEmail: string | null | undefined,
  existingPlans: string | null | undefined,
): Promise<PlanTier> {
  const supabase = getServiceSupabase();
  const email = (userEmail || "").trim();
  if (!email) {
    if (existingPlans && existingPlans !== "free") {
      await updateUserPlan(supabase, userId, "free", false);
    }
    return "free";
  }

  const customers = await listPolarCustomersByEmail(email);
  if (customers.length === 0) {
    if (existingPlans && existingPlans !== "free") {
      await updateUserPlan(supabase, userId, "free", false);
    }
    return "free";
  }

  const allSubs: PolarSubscription[] = [];
  for (const c of customers) {
    const subs = await listPolarSubscriptionsForCustomer(c.id);
    allSubs.push(...subs);
  }

  const current = currentPlanFromSubscriptions(allSubs);
  if (current === "free") {
    await updateUserPlan(supabase, userId, "free", false);
    return "free";
  }
  await updateUserPlan(supabase, userId, current, true);
  return current;
}

export async function readUserRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; plans: string | null } | null> {
  const { data, error } = await supabase
    .from("users")
    .select("email, plans")
    .eq("id", userId)
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0] as { email?: string | null; plans?: string | null };
  return { email: row.email ?? null, plans: row.plans ?? null };
}
