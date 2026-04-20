import { NextResponse } from "next/server";

/**
 * Cloudflare Pages(edge) 호환을 위해 정적 embed.html을 읽어 반환한다.
 */
export const runtime = "edge";

export async function GET(req: Request) {
  const embedUrl = new URL("/embed.html", req.url);
  const embedRes = await fetch(embedUrl.toString(), { method: "GET" });
  if (!embedRes.ok) {
    return NextResponse.json(
      { error: `embed fetch failed: ${embedRes.status}` },
      { status: 500 },
    );
  }
  const html = await embedRes.text();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
