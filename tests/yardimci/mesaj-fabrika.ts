// Mesajlaşma testleri için yardımcılar.
import type { Kanal } from "@/lib/mesajlasma";
import type { GonderimSonucu, Ileti, MessageProvider } from "@/server/messaging/saglayici";
import type { TenantContext } from "@/server/repo/baglam";
import { kayitGetir, kayitGuncelle, kayitlariEkle, taramaKayitlari, type KayitDegisikligi } from "@/server/repo/kayitlar";
import { taramaOlustur } from "@/server/repo/taramalar";

let sayac = 0;

/** Kiracıda yeni bir kayıt oluşturur ve verilen kullanıcı verisiyle günceller. */
export function kayitOlustur(ctx: TenantContext, alanlar: KayitDegisikligi = {}, placeId = `places-test-${++sayac}`) {
  const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "emlak_ofisi" });
  kayitlariEkle(ctx, t.id, [placeId]);
  const id = taramaKayitlari(ctx, t.id)[0].id;
  return Object.keys(alanlar).length ? kayitGuncelle(ctx, id, alanlar)! : kayitGetir(ctx, id)!;
}

/** Gönderimleri kaydeden sahte sağlayıcı; sonuç ve gecikme ayarlanabilir. */
export class SahteSaglayici implements MessageProvider {
  readonly ad = "sahte";
  readonly gonderilen: Ileti[] = [];
  constructor(
    readonly kanal: Kanal = "eposta",
    readonly sandbox = false,
    private sonuc: (ileti: Ileti, n: number) => GonderimSonucu = () => ({ durum: "gonderildi", saglayiciKimligi: "x" }),
    private gecikmeMs = 0,
  ) {}
  async gonder(ileti: Ileti): Promise<GonderimSonucu> {
    this.gonderilen.push(ileti);
    if (this.gecikmeMs) await new Promise((r) => setTimeout(r, this.gecikmeMs));
    return this.sonuc(ileti, this.gonderilen.length);
  }
}
