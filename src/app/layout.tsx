import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { RENK } from "@/lib/renk-belirtecleri";
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

// width=device-width, initial-scale=1; kullanıcının yakınlaştırması engellenmez (maximum-scale / user-scalable yok).
// resizes-content: Android Chrome'da klavye açılınca düzen alanı (dvh) küçülür, yazma alanı ve Gönder görünür kalır
// (iOS bu ayarı yok sayar; orada gelen kutusu visualViewport ile kaydırır).
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content", themeColor: RENK.ana };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${plex.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
