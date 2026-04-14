import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プレパレ！プロフィール帳",
  description: "スマホでめくって読めるプロフィール帳",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
	<html lang="ja">
  	<body>{children}</body>
	</html>
  );
}
``


