import fs from "node:fs/promises";
import path from "node:path";

/**
 * 루트 URL(`/`)에서 레거시 앱 HTML을 그대로 반환.
 * fetch+DOM 주입보다 초기 렌더가 빠르고 레이아웃 깨짐을 줄인다.
 */
export const runtime = "nodejs";

export async function GET() {
  const embedPath = path.join(process.cwd(), "public", "embed.html");
  const html = await fs.readFile(embedPath, "utf8");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
