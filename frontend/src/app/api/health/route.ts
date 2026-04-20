import { NextResponse } from "next/server";

export const runtime = "edge";

/** 배포·Polar 웹훅 등에서 쓸 수 있는 가벼운 헬스 체크 */
export function GET() {
  return NextResponse.json({ ok: true, service: "prismtab-frontend" });
}
