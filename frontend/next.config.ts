import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 이 파일이 `frontend/next.config.ts` 이므로 항상 Next 앱 루트 (pnpm 스토어 경로와 무관) */
const frontendDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // index.html 에서 주입되는 스크립트는 Strict 이중 effect에 안전하지 않음 — 최종 구조에서도 유지
  reactStrictMode: false,
  turbopack: {
    root: frontendDir,
  },
};

export default nextConfig;
