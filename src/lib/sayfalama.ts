// Sayfalı listelerin ortak hesapları (components/arayuz/sayfalama.tsx ve sunucu sayfaları). Saf işlevler: DOM ve
// veritabanı yok. Sayfa numarası adreste tutulur (?sayfa=, tarama sonuçlarında ?sonuc=); 1. sayfada parametre yazılmaz.
// Sayfa numarası liste tercihine (localStorage) yazılmaz (lib/liste-tercihi).
import { sayiYaz } from "./bicim";

/** Sayfa düğmeleri arasındaki kısaltma ("…"). */
export const SAYFA_BOSLUGU = "bosluk" as const;
export type SayfaOgesi = number | typeof SAYFA_BOSLUGU;

/** Toplam kayıttan sayfa sayısı (boş listede de 1). */
export const sayfaSayisiHesapla = (toplam: number, boyut: number) => Math.max(1, Math.ceil(Math.max(0, toplam) / Math.max(1, boyut)));

/** İstenen sayfayı 1..sayfaSayisi aralığına çeker (geçersiz / ondalık / NaN → en yakın geçerli sayfa, NaN → 1). */
export function sayfaSinirla(istenen: number, sayfaSayisi: number): number {
  const son = Math.max(1, Math.floor(sayfaSayisi) || 1);
  if (!Number.isFinite(istenen)) return istenen === Infinity ? son : 1;
  return Math.min(son, Math.max(1, Math.floor(istenen)));
}

/**
 * Gösterilecek sayfa düğmeleri: ilk, son, geçerli sayfa ve iki yanındaki `komsu` sayfa; aradaki boşluklar "…".
 * Tek sayfalık boşluk kısaltılmaz (1 … 3 yerine 1 2 3). Ör. 5 / 11 → 1 … 4 5 6 … 11.
 */
export function sayfaNumaralari(sayfa: number, sayfaSayisi: number, komsu = 1): SayfaOgesi[] {
  const son = Math.max(1, Math.floor(sayfaSayisi) || 1);
  const g = sayfaSinirla(sayfa, son);
  const sayilar = new Set<number>([1, son]);
  for (let i = g - komsu; i <= g + komsu; i++) if (i >= 1 && i <= son) sayilar.add(i);
  const sirali = [...sayilar].sort((a, b) => a - b);
  const sonuc: SayfaOgesi[] = [];
  for (const [i, n] of sirali.entries()) {
    const onceki = sirali[i - 1];
    if (onceki !== undefined) {
      if (n - onceki === 2) sonuc.push(onceki + 1);
      else if (n - onceki > 2) sonuc.push(SAYFA_BOSLUGU);
    }
    sonuc.push(n);
  }
  return sonuc;
}

export type SayfaGirdisiSonucu = { tur: "git"; sayfa: number; uyari: string | null } | { tur: "gecersiz"; uyari: string };

/**
 * "Sayfaya git" kutusunun değeri. Tam sayı değilse (harf, boş, ondalık) uyarı verilir ve gidilmez; aralık dışındaysa
 * (0, eksi, toplamdan büyük) en yakın geçerli sayfaya gidilir ve bunu söyleyen kısa bir not döner.
 */
export function sayfaGirdisiCoz(metin: string, sayfaSayisi: number): SayfaGirdisiSonucu {
  const son = Math.max(1, Math.floor(sayfaSayisi) || 1);
  const t = metin.trim();
  if (!/^[-+]?\d+$/.test(t)) return { tur: "gecersiz", uyari: `1 ile ${sayiYaz(son)} arasında bir sayfa numarası yazın.` };
  const n = Number(t);
  const sayfa = sayfaSinirla(n, son);
  if (sayfa === n) return { tur: "git", sayfa, uyari: null };
  return { tur: "git", sayfa, uyari: n < 1 ? "İlk sayfaya gidildi." : `Son sayfa ${sayiYaz(son)}; oraya gidildi.` };
}

/** Sayfadaki kayıtların sırası (1'den başlar): 3. sayfa, boyut 100, toplam 1045 → 201–300. Boş listede 0–0. */
export function sayfaAraligi(sayfa: number, boyut: number, toplam: number): { ilk: number; son: number } {
  if (toplam <= 0) return { ilk: 0, son: 0 };
  const g = sayfaSinirla(sayfa, sayfaSayisiHesapla(toplam, boyut));
  return { ilk: (g - 1) * boyut + 1, son: Math.min(toplam, g * boyut) };
}

/** "Sayfa 3 / 11 · 201–300 / 1.045 kayıt" (boş listede "0 kayıt"). */
export function sayfaBilgisi(sayfa: number, sayfaSayisi: number, boyut: number, toplam: number, kayitAdi = "kayıt"): string {
  if (toplam <= 0) return `0 ${kayitAdi}`;
  const { ilk, son } = sayfaAraligi(sayfa, boyut, toplam);
  return `Sayfa ${sayiYaz(sayfaSinirla(sayfa, sayfaSayisi))} / ${sayiYaz(sayfaSayisi)} · ${sayiYaz(ilk)}–${sayiYaz(son)} / ${sayiYaz(toplam)} ${kayitAdi}`;
}

/**
 * Sayfa bağlantısı: `taban` sayfasız adres ("/kayitlar?grup=tum"); sayfa parametresi 1. sayfada yazılmaz, diğer
 * parametreler aynen korunur.
 */
export function sayfaAdresi(taban: string, sayfa: number, param = "sayfa"): string {
  const [yol, sorgu = ""] = taban.split("?", 2);
  const s = new URLSearchParams(sorgu);
  if (sayfa > 1) s.set(param, String(Math.floor(sayfa)));
  else s.delete(param);
  return `${yol}${s.size ? `?${s}` : ""}`;
}

/** Adresteki sayfa değeri (yoksa / sayı değilse 1). */
export const adrestekiSayfa = (deger: string | undefined | null) => {
  const n = Number(deger);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};
