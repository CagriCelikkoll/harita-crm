import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

// Kimlikler, numaralar ve adresler (WABA ID, webhook adresi, telefon).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: { default: "Harita CRM", template: "%s · Harita CRM" },
  description: "Bölgedeki işletmeleri bulun, potansiyel müşteri olarak takip edin.",
  robots: { index: false, follow: false },
  // iPhone: ana ekrana eklenince tam ekran uygulama (Web Push yalnızca böyle çalışır). Manifest: app/manifest.ts.
  appleWebApp: { capable: true, title: "Harita CRM", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0e6655" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${plex.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
