/**
 * Prismtab 최종 워크플로 — 단일 원본은 항상 리포지토리 루트 `index.html`.
 *
 * 출력:
 *   1) src/legacy/prismtab.css  — 첫 `<style>...</style>` 내용 (향후 점진 이주 대비)
 *   2) public/embed.html        — index.html 그대로 복사(루트 route.ts에서 직접 반환)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, "..");
const repoRoot = path.join(frontendRoot, "..");
const indexPath = path.join(repoRoot, "index.html");
const outEmbed = path.join(frontendRoot, "public", "embed.html");
const outCss = path.join(frontendRoot, "src", "legacy", "prismtab.css");
const faviconSrc = path.join(repoRoot, "resources", "prismtabfavicon.jpeg");
const faviconOut = path.join(frontendRoot, "public", "resources", "prismtabfavicon.jpeg");
const languageProviderSrc = path.join(repoRoot, "languageprovider.js");
const languageProviderOut = path.join(frontendRoot, "public", "languageprovider.js");

let html = fs.readFileSync(indexPath, "utf8");

function normalizeEnvValue(raw) {
  const v = String(raw || "").trim();
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

function loadRootEnvForEmbed() {
  const rootEnvPath = path.join(repoRoot, ".env.local");
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

function escapeHtmlAttributeValue(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "&#39;");
}

loadRootEnvForEmbed();
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
html = html.replaceAll(
  "__PRISMTAB_GOOGLE_CID__",
  escapeHtmlAttributeValue(googleClientId),
);
html = html.replaceAll(
  "__PRISMTAB_SUPABASE_URL__",
  escapeHtmlAttributeValue(supabaseUrl),
);
html = html.replaceAll(
  "__PRISMTAB_SUPABASE_ANON_KEY__",
  escapeHtmlAttributeValue(supabaseAnonKey),
);

const styleMatch = html.match(/<style>\s*([\s\S]*?)\s*<\/style>/);
if (!styleMatch) {
  console.error("prepare-embed: index.html 안에 <style> 블록이 없습니다.");
  process.exit(1);
}
const css = styleMatch[1].trim();

fs.mkdirSync(path.dirname(outCss), { recursive: true });
fs.writeFileSync(
  outCss,
  `/* 자동 생성: pnpm sync-embed — 원본 리포지토리 루트 index.html 의 <style> */\n${css}\n`,
  "utf8"
);

fs.mkdirSync(path.dirname(outEmbed), { recursive: true });
fs.writeFileSync(outEmbed, html, "utf8");

if (fs.existsSync(faviconSrc)) {
  fs.mkdirSync(path.dirname(faviconOut), { recursive: true });
  fs.copyFileSync(faviconSrc, faviconOut);
} else {
  console.warn("prepare-embed: favicon source not found:", faviconSrc);
}

if (fs.existsSync(languageProviderSrc)) {
  fs.mkdirSync(path.dirname(languageProviderOut), { recursive: true });
  fs.copyFileSync(languageProviderSrc, languageProviderOut);
} else {
  console.warn("prepare-embed: languageprovider.js source not found:", languageProviderSrc);
}

console.log("prepare-embed: src/legacy/prismtab.css, public/embed.html, public/resources/prismtabfavicon.jpeg, public/languageprovider.js 갱신됨");
