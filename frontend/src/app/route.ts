import { NextResponse } from "next/server";

/**
 * Cloudflare Pages(edge) 호환을 위해 정적 embed.html을 읽어 반환한다.
 */
export const runtime = "edge";

function escapeHtmlAttributeValue(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "&#39;");
}

export async function GET(req: Request) {
  const embedUrl = new URL("/embed.html", req.url);
  const embedRes = await fetch(embedUrl.toString(), { method: "GET" });
  if (!embedRes.ok) {
    return NextResponse.json(
      { error: `embed fetch failed: ${embedRes.status}` },
      { status: 500 },
    );
  }
  const raw = await embedRes.text();
  const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const html = raw.replaceAll(
    "__PRISMTAB_GOOGLE_CID__",
    escapeHtmlAttributeValue(cid),
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
