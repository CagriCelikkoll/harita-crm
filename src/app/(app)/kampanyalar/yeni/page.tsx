import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { KUYRUK_KANALLARI, type KuyrukKanali } from "@/lib/mesajlasma";
import { smsAltbilgisi } from "@/lib/sablon";
import { sayfaBaglami } from "@/server/oturum";
import { etiketleriListele } from "@/server/repo/kayitlar";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { baglantiDurumu, sablonlar } from "@/server/servisler/whatsapp-api";
import { KampanyaSihirbazi } from "./kampanya-sihirbazi";

export const metadata: Metadata = { title: "Yeni kampanya" };

const tek = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function YeniKampanyaSayfasi({ searchParams }: PageProps<"/kampanyalar/yeni">) {
  const p = await searchParams;
  const { ctx } = await sayfaBaglami();
  const yonetici = ctx.rol === "yonetici";
  const ayarlar = mesajlasmaAyarlariDto(ctx);
  // ?kanal= (ör. Ayarlar > WhatsApp "Test kampanyası oluştur"); WhatsApp (API) yalnızca yöneticiye.
  const istenenKanal = KUYRUK_KANALLARI.find((k) => k === tek(p.kanal));
  const ilkKanal: KuyrukKanali | null = istenenKanal && (istenenKanal !== "whatsapp_api" || yonetici) ? istenenKanal : null;

  return (
    <>
      <SayfaBasligi baslik="Yeni kampanya" aciklama="Kanalı, alıcıları ve mesajı adım adım seçin; göndermeden önce özeti görürsünüz." />
      <KampanyaSihirbazi
        adim={tek(p.adim) ?? null}
        ilkKanal={ilkKanal}
        etiketler={etiketleriListele(ctx)}
        saglayicilar={ayarlar.saglayicilar}
        eksikAyarlar={ayarlar.eksikAyarlar}
        smsAltbilgisi={smsAltbilgisi(ayarlar)}
        whatsapp={{
          yonetici,
          bagli: baglantiDurumu(ctx).tanimli,
          sablonlar: yonetici ? sablonlar(ctx).filter((x) => x.kullanilabilir) : [],
        }}
      />
    </>
  );
}
