/** Polar REST v1 base URL (POLAR_SERVER_MODE) */
export function getPolarApiBase(): string {
  const mode = (process.env.POLAR_SERVER_MODE || "production").toLowerCase();
  return mode === "sandbox" ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1";
}

export function getPolarProductIds(): { pro: string; team: string } {
  return {
    pro: (process.env.POLAR_PRO_PRODUCT_ID || "").trim(),
    team: (process.env.POLAR_TEAM_PRODUCT_ID || "").trim(),
  };
}

export async function polarRequest<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error("POLAR_ACCESS_TOKEN is not set");
  const url = `${getPolarApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const hdrs = new Headers(init?.headers);
  hdrs.set("Authorization", `Bearer ${token}`);
  if (init?.body && typeof init.body === "string" && !hdrs.has("Content-Type")) {
    hdrs.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers: hdrs });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Polar ${res.status}: ${text.slice(0, 800)}`);
  }
  if (res.status === 204 || !text) return undefined as T;
  return JSON.parse(text) as T;
}

export function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}
