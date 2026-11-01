// Ayarlar'ın sol menüsü: gruplar ve bölümler (her bölüm ayrı rota, /ayarlar/<yol>).
// Üye yalnızca kendini ilgilendiren bölümleri görür (Çalışma alanı, Ekip, Kullanım, Saatler ve sınırlar, WhatsApp
// listesi). Kanal kimlik bilgileri, Gönderen bilgileri ve Veri saklama yalnızca yöneticiye görünür. Bu yalnızca
// gezinmedir: sunucu tarafı yetki denetimleri ayrıca yapılır.
import type { Rol } from "./sabitler";

export type AyarBolumuTanimi = {
  yol: string;
  ad: string;
  yalnizcaYonetici: boolean;
  /** Kanal bölümlerinde menüdeki bağlantı noktası. */
  kanal?: "whatsapp" | "sms" | "eposta";
};

export const AYAR_GRUPLARI: { ad: string; bolumler: AyarBolumuTanimi[] }[] = [
  {
    ad: "Genel",
    bolumler: [
      { yol: "calisma-alani", ad: "Çalışma alanı", yalnizcaYonetici: false },
      { yol: "ekip", ad: "Ekip ve roller", yalnizcaYonetici: false },
      { yol: "kullanim", ad: "Kullanım ve paket", yalnizcaYonetici: false },
    ],
  },
  {
    ad: "Gönderim",
    bolumler: [
      { yol: "gonderen", ad: "Gönderen bilgileri", yalnizcaYonetici: true },
      { yol: "saatler", ad: "Saatler ve sınırlar", yalnizcaYonetici: false },
      { yol: "whatsapp-listesi", ad: "WhatsApp listesi", yalnizcaYonetici: false },
    ],
  },
  {
    ad: "Kanallar",
    bolumler: [
      { yol: "whatsapp", ad: "WhatsApp (Meta)", yalnizcaYonetici: true, kanal: "whatsapp" },
      { yol: "sms", ad: "SMS", yalnizcaYonetici: true, kanal: "sms" },
      { yol: "eposta", ad: "E-posta", yalnizcaYonetici: true, kanal: "eposta" },
    ],
  },
  {
    ad: "Veri",
    bolumler: [{ yol: "veri", ad: "Veri saklama", yalnizcaYonetici: true }],
  },
];

export const ILK_AYAR_BOLUMU = "/ayarlar/calisma-alani";

/** Role göre görünen gruplar; içinde hiç bölüm kalmayan grup gösterilmez. */
export function ayarGruplari(rol: Rol) {
  return AYAR_GRUPLARI.map((g) => ({ ...g, bolumler: g.bolumler.filter((b) => rol === "yonetici" || !b.yalnizcaYonetici) })).filter(
    (g) => g.bolumler.length > 0,
  );
}

/** Bölüm bu role açık mı (rota korumasında kullanılır: açık değilse ilk bölüme yönlendirilir). */
export function ayarBolumuAcikMi(yol: string, rol: Rol): boolean {
  return ayarGruplari(rol).some((g) => g.bolumler.some((b) => b.yol === yol));
}
