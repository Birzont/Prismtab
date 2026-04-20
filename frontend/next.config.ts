import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 이 파일이 `frontend/next.config.ts` 이므로 항상 Next 앱 루트 (pnpm 스토어 경로와 무관) */
const frontendDir = path.dirname(fileURLToPath(import.meta.url));

function normalizeEnvValue(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  const inlineCommentIdx = v.indexOf(" #");
  return inlineCommentIdx >= 0 ? v.slice(0, inlineCommentIdx).trimEnd() : v;
}

function loadRootEnvFallback() {
  const rootEnvPath = path.resolve(frontendDir, "../.env.local");
  if (!fs.existsSync(rootEnvPath)) return;
  const source = fs.readFileSync(rootEnvPath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key || process.env[key]) continue;
    const value = normalizeEnvValue(trimmed.slice(eqIdx + 1));
    process.env[key] = value;
  }
}

loadRootEnvFallback();

const nextConfig: NextConfig = {
  // index.html 에서 주입되는 스크립트는 Strict 이중 effect에 안전하지 않음 — 최종 구조에서도 유지
  reactStrictMode: false,
  turbopack: {
    root: frontendDir,
  },
};

export default nextConfig;
