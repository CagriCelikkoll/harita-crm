// Gelen kutusu: pencere kapalıyken kolay yeniden başlatma. Pencere durumu metni (her zaman görünür), Fayda (Utility)
// öncelikli şablon sırası ve "önerilen", Fayda şablonu yoksa yönlendirme, müşteri yazınca bildirim ve yazma alanı.
// Sunucu kuralları (RET, izin/İYS, test modu, sınırlar, WABA eşleşmesi) tests/gelen-kutusu.test.ts içinde.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAYDA_SABLONU_YOK_METNI,
  kalanSureMetni,
  ONERILEN_SABLON_KATEGORISI,
  PENCERE_ACILDI_BILDIRIMI,
  PENCERE_HIC_ACILMADI_METNI,
  PENCERE_KAPALI_METNI,
  PENCERE_MS,
  pencereDurumu,
  yenidenBaslatmaSablonlari,
} from "@/lib/gelen-kutusu";
import { SABLON_KATEGORI_ADLARI } from "@/lib/whatsapp-api";

const DK = 60_000;
const SA = 60 * DK;
const istemci = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/gelen-kutusu/gelen-kutusu.tsx"), "utf8");

describe("pencere durumu metni", () => {
  it("açıkken kalan süre, kapalıyken istenen uyarı; hiç yazmadıysa ayrı metin", () => {
    const simdi = Date.UTC(2026, 10, 28, 12);
    const yazdi = (kalanMs: number) => new Date(simdi - PENCERE_MS + kalanMs).toISOString();
    expect(pencereDurumu(yazdi(14 * SA + 20 * DK + 30_000), simdi)).toMatchObject({ acik: true, metin: "Serbest mesaj: 14 sa 20 dk kaldı" });
    expect(pencereDurumu(yazdi(2 * SA), simdi).metin).toBe("Serbest mesaj: 2 sa kaldı");
    expect(pencereDurumu(yazdi(40 * DK), simdi).metin).toBe("Serbest mesaj: 40 dk kaldı");
    expect(pencereDurumu(yazdi(10_000), simdi).metin).toBe("Serbest mesaj: 1 dk kaldı");
    expect(pencereDurumu(yazdi(0), simdi)).toEqual({ acik: false, kalanMs: null, metin: PENCERE_KAPALI_METNI });
    expect(pencereDurumu(yazdi(-5 * SA), simdi).metin).toBe("Müşteri 24 saattir yazmadı — yalnızca onaylı şablon gönderilebilir");
    expect(pencereDurumu(null, simdi)).toEqual({ acik: false, kalanMs: null, metin: PENCERE_HIC_ACILMADI_METNI });
    expect(kalanSureMetni(23 * SA + 59 * DK)).toBe("23 sa 59 dk");
  });
});

describe("yeniden başlatma şablonları", () => {
  it("Fayda en üstte ve önerilen; sonra Pazarlama, Doğrulama, diğerleri; aynı kategoride ada göre", () => {
    const l = yenidenBaslatmaSablonlari([
      { ad: "kampanya", kategori: "MARKETING" },
      { ad: "kod", kategori: "AUTHENTICATION" },
      { ad: "talep_hazir", kategori: "UTILITY" },
      { ad: "bilinmeyen", kategori: "YENI" },
      { ad: "randevu", kategori: "utility" },
    ]);
    expect(l.map((x) => [x.sablon.ad, x.onerilen])).toEqual([
      ["randevu", true],
      ["talep_hazir", true],
      ["kampanya", false],
      ["kod", false],
      ["bilinmeyen", false],
    ]);
    expect(yenidenBaslatmaSablonlari([])).toEqual([]);
    expect(ONERILEN_SABLON_KATEGORISI).toBe("UTILITY");
    expect(SABLON_KATEGORI_ADLARI.UTILITY).toBe("Fayda");
    expect(FAYDA_SABLONU_YOK_METNI).toBe("Meta'da bir Fayda şablonu oluşturun (ör. talep_hazir)");
  });
});

describe("sohbet ekranı", () => {
  it("pencere çubuğu her zaman; kapalıyken yazma alanı yerine 'Konuşmayı yeniden başlat'; Fayda yoksa yönlendirme; açılınca bildirim", () => {
    // Çubuk yazma alanından önce, koşulsuz.
    expect(istemci).toMatch(/<PencereDurumCubugu durum=\{pencere\} \/>\s*<YazmaAlani/);
    expect(istemci).toContain("const pencere = pencereDurumu(s.sonGelenTarihi, props.simdi);");
    // Kapalı pencere: RET ve izinsiz durumlarının açıklaması kalır; izinliye yeniden başlatma.
    expect(istemci).toMatch(/if \(!props\.pencereAcik\) \{[\s\S]*?return <YenidenBaslat /);
    expect(istemci).toContain("Konuşmayı yeniden başlat");
    expect(istemci).toContain("yenidenBaslatmaSablonlari(props.a.sablonlar)");
    expect(istemci).toContain("{onerilen && <DurumRozeti ton=\"ana\">Önerilen</DurumRozeti>}");
    expect(istemci).toContain("{FAYDA_SABLONU_YOK_METNI}");
    expect(istemci).toContain("{!faydaVar && <FaydaSablonuYonlendirmesi");
    // Önizleme ve gönder.
    expect(istemci).toContain('aria-label="Önizleme"');
    expect(istemci).toContain("Şablonu gönder");
    // Müşteri yazınca (canlı yenileme) kapalı → açık geçişinde bildirim; yazma alanı pencereAcik ile geri gelir.
    expect(istemci).toContain("if (!oncekiPencere.current && pencereAcik) bildir(PENCERE_ACILDI_BILDIRIMI);");
    expect(PENCERE_ACILDI_BILDIRIMI).toMatch(/pencere açıldı/);
    // Eski alt bilgi kaldırıldı (durum çubukta).
    expect(istemci).not.toContain("tarihine kadar açık");
  });
});
