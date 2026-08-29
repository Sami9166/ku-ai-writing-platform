import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "KUtrace | 고려대학교 AI 협업 과정 기록 플랫폼",
  description: "학생의 글쓰기와 AI 협업 판단 과정을 함께 기록하는 고려대학교 학습 플랫폼",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "KUtrace | 고려대학교 AI 협업 과정 기록 플랫폼",
    description: "글쓰기와 AI 협업의 과정을 함께 기록합니다",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/og.png", width: 1732, height: 909, alt: "KUtrace | 고려대학교 AI 협업 과정 기록 플랫폼" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KUtrace | 고려대학교 AI 협업 과정 기록 플랫폼",
    description: "글쓰기와 AI 협업의 과정을 함께 기록합니다",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
