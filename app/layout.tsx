import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
