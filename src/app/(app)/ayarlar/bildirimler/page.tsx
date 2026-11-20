import type { Metadata } from "next";
import { AyarBolumu, Kart, KartBaslik } from "@/components/arayuz/kart";
import { pushCihazlariListele } from "@/server/repo/push-abonelikleri";
import { vapidAcikAnahtari } from "@/server/servisler/bildirim";
import { ayarBolumuBaglami } from "../erisim";
import { BildirimAyari, CihazSatiri } from "./bildirim-ayari";

export const metadata: Metadata = { title: "Bildirimler · Ayarlar" };

const tarih = (t: Date) => t.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

// Kişisel: herkes yalnızca kendi cihazlarını yönetir. Bildirimde mesaj içeriği yoktur.
export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("bildirimler");
  const acikAnahtar = vapidAcikAnahtari();
  const cihazlar = pushCihazlariListele(ctx);
  return (
    <AyarBolumu
      baslik="Bildirimler"
      aciklama="Gelen kutusuna yeni WhatsApp mesajı düşünce bu cihazda bildirim. Bildirimde mesajın içeriği yer almaz; yalnızca “Yeni WhatsApp mesajı – kişi adı” görünür."
    >
      <Kart etiket="Bu cihaz">
        <KartBaslik
          baslik="Bu cihaz"
          aciklama="Sohbet size atanmışsa yalnızca size, atanmamışsa ekipteki herkese bildirim gider. Çıkış yapınca bu cihaza bildirim gitmez."
        />
        <BildirimAyari acikAnahtar={acikAnahtar} />
      </Kart>
      <Kart etiket="Bildirim alan cihazlarınız">
        <KartBaslik baslik="Bildirim alan cihazlarınız" aciklama={`${cihazlar.length} cihaz`} />
        {cihazlar.length === 0 ? (
          <p className="border-t border-cizgi px-7 py-6 text-sm text-soluk">Henüz hiçbir cihazda açılmadı.</p>
        ) : (
          <ul>
            {cihazlar.map((c) => (
              <CihazSatiri
                key={c.id}
                id={c.id}
                ad={c.cihaz ?? "Bilinmeyen cihaz"}
                ayrinti={`Eklendi: ${tarih(c.olusturmaTarihi)}${c.sonBasariTarihi ? ` · Son bildirim: ${tarih(c.sonBasariTarihi)}` : ""}`}
              />
            ))}
          </ul>
        )}
      </Kart>
    </AyarBolumu>
  );
}
