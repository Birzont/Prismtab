import type { Metadata } from "next";
import "./globals.css";
/** `pnpm sync-embed` 가 루트 index.html 의 <style> 으로부터 생성 */
import "@/legacy/prismtab.css";

export const metadata: Metadata = {
  title: "웹페이지 z 바로가기",
  description: "Prismtab 바로가기",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
