// 10 dakikadan uzun süredir "calisiyor" durumunda kalan taramalar "hata" olarak işaretlenir
// (uygulama başlarken tüm kiracılarda, tarama listesi yüklenirken ilgili kiracıda).
import { beforeEach, describe, expect, it } from "vitest";
import { YARIM_KALDI_MESAJI } from "@/lib/sabitler";
import { db } from "@/server/db";
import type { TenantContext } from "@/server/repo/baglam";
import { tumYarimKalanTaramalariKapat } from "@/server/repo/sistem/bakim";
import { taramaBaslat, taramaGetir, taramaOlustur, yarimKalanTaramalariKapat } from "@/server/repo/taramalar";
import { kiraciOlustur } from "./yardimci/fabrika";

const DAKIKA = 60 * 1000;
let A: TenantContext;
let B: TenantContext;

function tarama(ctx: TenantContext, durum: "kuyrukta" | "calisiyor" | "tamamlandi", dakikaOnce: number | null) {
  const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 2000, kategori: "kafe" });
  db.$client
    .prepare("update scans set durum = ?, baslama_tarihi = ? where id = ?")
    .run(durum, dakikaOnce === null ? null : Date.now() - dakikaOnce * DAKIKA, t.id);
  return t.id;
}

beforeEach(() => {
  A = kiraciOlustur("Ali").ctx;
  B = kiraciOlustur("Banu").ctx;
});

describe("yarıda kalan taramalar", () => {
  it("taramaBaslat başlama zamanını yazar", () => {
    const t = taramaOlustur(A, { merkezLat: 41, merkezLng: 29, yaricapM: 2000, kategori: "kafe" });
    const once = Date.now();
    const baslayan = taramaBaslat(A, t.id)!;
    expect(baslayan.durum).toBe("calisiyor");
    expect(baslayan.baslamaTarihi!.getTime()).toBeGreaterThanOrEqual(once - 1000);
  });

  it("kiracı listesi yüklenirken: yalnızca bu kiracının 10 dk'dan eski 'calisiyor' taramaları 'hata' olur", () => {
    const eski = tarama(A, "calisiyor", 11);
    const yeni = tarama(A, "calisiyor", 5);
    const kuyrukta = tarama(A, "kuyrukta", null);
    const bitmis = tarama(A, "tamamlandi", 60);
    const baskaKiraci = tarama(B, "calisiyor", 30);

    expect(yarimKalanTaramalariKapat(A)).toBe(1);

    const e = taramaGetir(A, eski)!;
    expect(e.durum).toBe("hata");
    expect(e.hataMesaji).toBe(YARIM_KALDI_MESAJI);
    expect(e.tamamlanmaTarihi).not.toBeNull();
    expect(taramaGetir(A, yeni)!.durum).toBe("calisiyor");
    expect(taramaGetir(A, kuyrukta)!.durum).toBe("kuyrukta");
    expect(taramaGetir(A, bitmis)!.durum).toBe("tamamlandi");
    expect(taramaGetir(B, baskaKiraci)!.durum).toBe("calisiyor");
  });

  it("sınır: tam 10 dakika dolmadan işaretlenmez", () => {
    const simdi = new Date();
    const t = tarama(A, "calisiyor", 0);
    db.$client.prepare("update scans set baslama_tarihi = ? where id = ?").run(simdi.getTime() - 10 * DAKIKA + 1000, t);
    expect(yarimKalanTaramalariKapat(A, simdi)).toBe(0);
    expect(yarimKalanTaramalariKapat(A, new Date(simdi.getTime() + 2000))).toBe(1);
  });

  it("uygulama başlangıcı: tüm kiracılardaki eski 'calisiyor' taramalar 'hata' olur", () => {
    const a = tarama(A, "calisiyor", 15);
    const b = tarama(B, "calisiyor", 45);
    const taze = tarama(B, "calisiyor", 2);
    expect(tumYarimKalanTaramalariKapat()).toBeGreaterThanOrEqual(2);
    expect(taramaGetir(A, a)!.durum).toBe("hata");
    expect(taramaGetir(B, b)!.hataMesaji).toBe(YARIM_KALDI_MESAJI);
    expect(taramaGetir(B, taze)!.durum).toBe("calisiyor");
  });
});
