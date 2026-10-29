import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

// One family across the app: Inter Tight for headings and body. Self-hosted by
// next/font at build time, exposed as --font-inter-tight for Tailwind.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter-tight",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Freedom Family Electric Quote App",
  description: "Internal quoting tool for Freedom Family Electric."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={interTight.variable}>
      <body className={interTight.className}>{children}</body>
    </html>
  );
}
