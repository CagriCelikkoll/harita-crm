import Link from "next/link";
import { GoogleAtfi } from "@/components/google-atfi";
import { tarihYaz } from "@/lib/bicim";
import { ILETI_IZNI_ADLARI, KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI, OLAY_TURU_ADLARI } from "@/lib/sabitler";
import type { TenantContext } from "@/server/repo/baglam";
import type { Kayit } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { canliBilgiGetir } from "@/server/servisler/canli-bilgi";
import { durumDegistir, iletiIzniOnayla, iletiReddiIsaretle } from "./eylemler";
import { BilgiFormu, IletisimDugmeleri, KayitSilDugmesi, NotFormu, NotSatiri } from "./detay-parcalari";

export async function KayitDetayi({ ctx, kayit, kapatBaglantisi }: { ctx: TenantContext; kayit: Kayit; kapatBaglantisi: string }) {
  // Canlı Places detayı: yalnızca bu istek boyunca bellekte.
  const canli = (await canliBilgiGetir(ctx, [kayit.placeId], "detay")).get(kayit.placeId);
  const yer = canli?.durum === "tamam" ? canli.yer : null;
  const olaylar = olaylariListele(ctx, kayit.id);

  return (
    <aside className="kart flex flex-col gap-4 xl:sticky xl:top-5" aria-label="Kayıt detayı">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{yer?.ad ?? "İşletme bilgisi alınamadı"}</h2>
          {yer?.adres && <p className="text-sm text-soluk">{yer.adres}</p>}
        </div>
        <Link href={kapatBaglantisi} scroll={false} className="dugme shrink-0" aria-label="Detayı kapat">
          Kapat
        </Link>
      </div>

      {yer ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-soluk">Telefon</dt>
          <dd>{yer.telefon ?? "—"}</dd>
          <dt className="text-soluk">Web sitesi</dt>
          <dd className="truncate">
            {yer.webSitesi ? (
              <a href={yer.webSitesi} target="_blank" rel="noopener noreferrer" className="text-ana underline">
                {yer.webSitesi.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              "—"
            )}
          </dd>
          {yer.puan !== undefined && (
            <>
              <dt className="text-soluk">Puan</dt>
              <dd>
                {yer.puan} ({yer.puanSayisi ?? 0} değerlendirme)
              </dd>
            </>
          )}
          {yer.isletmeDurumu && yer.isletmeDurumu !== "OPERATIONAL" && (
            <>
              <dt className="text-soluk">Durum</dt>
              <dd className="text-tehlike">{yer.isletmeDurumu === "CLOSED_PERMANENTLY" ? "Kalıcı olarak kapalı" : "Geçici olarak kapalı"}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm text-tehlike">
          {canli?.durum === "bulunamadi" ? "Bu işletme Google'da artık bulunmuyor." : `Places hatası: ${canli?.durum === "hata" ? canli.mesaj : ""}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {yer?.googleMapsUri && (
          <a href={yer.googleMapsUri} target="_blank" rel="noopener noreferrer" className="dugme">
            Google Haritalar&apos;da aç
          </a>
        )}
        <IletisimDugmeleri id={kayit.id} telefon={yer?.telefonUluslararasi ?? yer?.telefon ?? kayit.ekTelefon} eposta={kayit.eposta} />
      </div>
      <GoogleAtfi />

      <section className="flex flex-col gap-2 border-t border-kenar pt-4">
        {/* key: durum değişince form yeniden oluşur; aksi hâlde defaultValue eski değerde kalır. */}
        <form key={`${kayit.id}-${kayit.durum}`} action={durumDegistir} className="flex items-end gap-2">
          <input type="hidden" name="id" value={kayit.id} />
          <label className="etiket flex-1">
            Durum
            <select name="durum" defaultValue={kayit.durum} className="girdi">
              {KAYIT_DURUMLARI.map((d) => (
                <option key={d} value={d}>
                  {KAYIT_DURUM_ADLARI[d]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="dugme-ana">
            Değiştir
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            İleti izni:{" "}
            <strong className={kayit.iletiIzni === "ret" ? "text-tehlike" : ""}>{ILETI_IZNI_ADLARI[kayit.iletiIzni]}</strong>
          </span>
          {kayit.iletiIzni !== "ret" && (
            <form action={iletiReddiIsaretle}>
              <input type="hidden" name="id" value={kayit.id} />
              <button type="submit" className="dugme-tehlike">
                İleti reddi işaretle
              </button>
            </form>
          )}
          {kayit.iletiIzni === "bekliyor" && (
            <form action={iletiIzniOnayla}>
              <input type="hidden" name="id" value={kayit.id} />
              <button type="submit" className="dugme">
                İzin alındı
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="border-t border-kenar pt-4">
        <h3 className="mb-2 font-semibold">Bilgiler ve notlar</h3>
        <BilgiFormu kayit={{ id: kayit.id, yetkiliAdi: kayit.yetkiliAdi, eposta: kayit.eposta, ekTelefon: kayit.ekTelefon, notlar: kayit.notlar, etiketler: kayit.etiketler }} />
      </section>

      <section className="border-t border-kenar pt-4">
        <h3 className="mb-2 font-semibold">Etkinlikler</h3>
        <NotFormu id={kayit.id} />
        <ol className="mt-3 flex flex-col gap-2">
          {olaylar.map((o) => (
            <li key={o.id} className="border-l-2 border-ana/40 pl-3 text-sm">
              <p className="text-xs text-soluk">
                {tarihYaz(o.tarih)} · {OLAY_TURU_ADLARI[o.tur]}
                {o.kullaniciAdi && ` · ${o.kullaniciAdi}`}
              </p>
              {o.tur === "not" && !o.sistem && o.kullaniciId === ctx.userId && o.aciklama ? (
                <NotSatiri olayId={o.id} metin={o.aciklama} />
              ) : (
                o.aciklama && <p className="whitespace-pre-wrap">{o.aciklama}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-kenar pt-4">
        <KayitSilDugmesi id={kayit.id} />
      </section>
    </aside>
  );
}
