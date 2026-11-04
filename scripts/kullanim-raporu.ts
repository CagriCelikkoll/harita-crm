// npm run kullanim raporu (saf; testler doğrudan çağırır). Arayüz yalnızca yüzde gösterir; bu rapor birim ve dolar
// karşılığını yazar (1 birim = 0,001 $, Google liste fiyatı; ücretsiz kullanım payları düşülmez).
import type { Database } from "better-sqlite3";
import { kullanimOzeti } from "../src/lib/arayuz";
import { BIRIM_DOLAR } from "../src/lib/places-birimleri";
import { KOTA_UYARI_ORANI } from "../src/lib/sabitler";

const KALEMLER = [
  ["Tarama", "tarama_birim"],
  ["İşletme bilgisi", "isletme_bilgisi_birim"],
  ["İletişim bilgisi", "iletisim_bilgisi_birim"],
  ["Harita", "harita_birim"],
] as const;

type Sayac = { toplam: number } & Record<(typeof KALEMLER)[number][1], number>;

const birim = (n: number) => `${n.toLocaleString("tr-TR")} birim`;
const dolar = (n: number) =>
  `${(n * BIRIM_DOLAR).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} $`;

/** Çalışma alanının `ay` ("2026-11") kullanımı, satır satır. Slug yoksa null. */
export function kullanimRaporu(sqlite: Database, slug: string, ay: string): string[] | null {
  const kiraci = sqlite.prepare("select id, ad, aylik_places_kotasi kota from tenants where slug = ?").get(slug) as
    | { id: string; ad: string; kota: number }
    | undefined;
  if (!kiraci) return null;
  const s = (sqlite
    .prepare(
      `select places_istek_sayisi toplam, ${KALEMLER.map(([, sutun]) => sutun).join(", ")} from usage_counters where tenant_id = ? and ay = ?`,
    )
    .get(kiraci.id, ay) as Sayac | undefined) ?? { toplam: 0, tarama_birim: 0, isletme_bilgisi_birim: 0, iletisim_bilgisi_birim: 0, harita_birim: 0 };

  const oran = kiraci.kota > 0 ? Math.min(1, s.toplam / kiraci.kota) : 1;
  const { yuzde } = kullanimOzeti({ oran, uyari: oran >= KOTA_UYARI_ORANI, doldu: s.toplam >= kiraci.kota });
  const kalemler: [string, number][] = KALEMLER.map(([ad, sutun]) => [ad, s[sutun]]);
  const kalemsiz = s.toplam - kalemler.reduce((t, [, n]) => t + n, 0);
  if (kalemsiz > 0) kalemler.push(["Kalemsiz (eski)", kalemsiz]);

  const genislik = Math.max(...[s.toplam, kiraci.kota, ...kalemler.map(([, n]) => n)].map((n) => birim(n).length));
  const satir = (ad: string, n: number) => `  ${ad.padEnd(18)}${birim(n).padStart(genislik)}   ${dolar(n).padStart(9)}`;
  return [
    `${kiraci.ad} (${slug}) · ${ay} kullanımı (1 birim = 0,001 $, liste fiyatı; ücretsiz paylar düşülmez)`,
    satir("Toplam", s.toplam),
    ...kalemler.map(([ad, n]) => satir(ad, n)),
    satir("Aylık kota", kiraci.kota),
    `  Arayüzdeki yüzde: %${yuzde}${oran >= KOTA_UYARI_ORANI ? " (otomatik gösterim sınırına ulaşıldı)" : ""}`,
  ];
}
