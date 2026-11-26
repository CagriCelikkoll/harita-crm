// PWA bildirimi (manifest): ana ekrana eklenince gelen kutusu açılır, tarayıcı çubuğu olmadan. iPhone'da Web Push
// yalnızca bu şekilde (ana ekrana eklenmiş uygulamada) çalışır.
import type { MetadataRoute } from "next";
import { RENK } from "@/lib/renk-belirtecleri";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Harita CRM",
    short_name: "Harita CRM",
    description: "Bölgedeki işletmeleri bulun, potansiyel müşteri olarak takip edin; WhatsApp gelen kutusu.",
    lang: "tr",
    dir: "ltr",
    start_url: "/gelen-kutusu",
    scope: "/",
    display: "standalone",
    background_color: RENK.zemin,
    theme_color: RENK.ana,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
