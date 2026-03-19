import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Pastikan Anda memiliki file globals.css dengan directive Tailwind

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Abiina Cup",
  description: "Portal Akademik dan Galeri Karya Digital Mahasantri",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  );
}