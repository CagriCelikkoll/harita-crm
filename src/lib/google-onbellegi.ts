// Google'dan gelen bilgiler (liste: ad, adres, konum; detay: iletişim bilgileri) için istemcide YALNIZCA BELLEKTE
// tutulan, kayıt kimliğine göre en fazla 30 dakikalık önbellek. Aynı oturumda (sayfa, sekme ya da süzgeç değişip
// geri dönülünce) aynı kayıt için Google'a yeniden gidilmez.
//
// Bu bir Places politikası yorumudur (README "Alınan kararlar"): içerik tarayıcı depolamasına (localStorage,
// sessionStorage, IndexedDB, Cache API) ve sunucuya YAZILMAZ; modül düzeyindeki Map yalnızca o sekmenin belleğinde
// yaşar. Silinir: sayfa yenilenince (modül yeniden yüklenir), çıkış yapılınca ve çalışma alanı değişince
// (googleOnbellekleriniTemizle), 30 dakika dolunca (okumada süresi geçen kayıt atılır). Süre ilk alınıştan sayılır;
// okumak süreyi uzatmaz.
import type { CanliSonuc, ListeBilgisi } from "@/server/servisler/canli-bilgi";

export const GOOGLE_ONBELLEK_SURESI_MS = 30 * 60_000;

export class BellekOnbellegi<T> {
  private readonly kayitlar = new Map<string, { deger: T; zaman: number }>();

  constructor(
    private readonly sure = GOOGLE_ONBELLEK_SURESI_MS,
    private readonly saat: () => number = () => Date.now(),
  ) {}

  al(id: string): T | undefined {
    const k = this.kayitlar.get(id);
    if (!k) return undefined;
    if (this.saat() - k.zaman >= this.sure) {
      this.kayitlar.delete(id);
      return undefined;
    }
    return k.deger;
  }

  koy(id: string, deger: T) {
    this.kayitlar.set(id, { deger, zaman: this.saat() });
  }

  temizle() {
    this.kayitlar.clear();
  }

  get boyut() {
    return this.kayitlar.size;
  }
}

/** Liste / inceleme / kampanya alıcıları: yalnızca başarılı sonuçlar (hata ya da kota mesajı önbelleğe girmez). */
export const listeOnbellegi = new BellekOnbellegi<ListeBilgisi>();
/** Kayıt detayı (Place Details Enterprise sonucu); yalnızca "tamam" sonuçlar. */
export const detayOnbellegi = new BellekOnbellegi<CanliSonuc>();

/** Çıkışta ve çalışma alanı değişince çağrılır. */
export function googleOnbellekleriniTemizle() {
  listeOnbellegi.temizle();
  detayOnbellegi.temizle();
}
