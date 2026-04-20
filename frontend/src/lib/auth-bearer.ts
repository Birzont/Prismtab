import { createClient } from "@supabase/supabase-js";

export type AuthResult =
  | { userId: string }
  | { error: string; status: number };

export async function getUserIdFromBearer(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { error: "Unauthorized", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { error: "Server misconfigured", status: 500 };
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }
  return { userId: data.user.id };
}
