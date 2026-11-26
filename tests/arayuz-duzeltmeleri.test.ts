// UI test raporu düzeltmeleri (Kasım 2026): telefonda ekran dışına açılan Filtreler paneli, Kayıtlar tablosunun
// sayfayı yatay taşırması, sihirbazda <fieldset> taşması, görsel yüklüyken "Dosya seçilmedi", gelen kutusunda alta
// kaymama ve "Gönder"in görünür alandan çıkması, Kayıtlar listesinin Google'a gitmemesi, dışarı tıklamanın alttaki
// öğeyi tetiklememesi.
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { ekranaSigdir } = await import("@/components/arayuz/acilir-panel");
const { disariTiklamaDinle, sonrakiTiklamayiYut } = await import("@/lib/disari-tiklama");
const { KayitTablosu } = await import("@/app/(app)/kayitlar/kayit-tablosu");

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");

describe("Filtreler paneli ekrana sığar", () => {
  it("sağa hizalı panel dar ekranda sola taşıyorsa sağa kaydırılır; sağdan taşıyorsa sola; sığıyorsa dokunulmaz", () => {
    // 375 px ekran, düğme solda: right-0 panel −210..133 → 8 px kenara.
    expect(ekranaSigdir(-210, 133, 375)).toBe(218);
    expect(ekranaSigdir(300, 660, 640)).toBe(-28);
    expect(ekranaSigdir(100, 400, 1440)).toBe(0);
    // Ekrandan genişse soldan hizalanır.
    expect(ekranaSigdir(-50, 500, 375)).toBe(58);
  });

  it("panel açılınca ölçülüp kaydırılır, pencere boyutu değişince yeniden; dışarı tıklama alttaki öğeyi tetiklemez", () => {
    const panel = oku("src/components/arayuz/acilir-panel.tsx");
    expect(panel).toContain("ekranaSigdir(r.left, r.right, document.documentElement.clientWidth)");
    expect(panel).toContain('window.addEventListener("resize", yerlestir)');
    expect(panel).toContain("{ tiklamayiYut: true }");
  });
});

describe("dışarı tıklama yutulur", () => {
  /** Yakalama aşamalı dinleyicilerle basit belge benzeri hedef. */
  const olay = (tur: string, hedef: EventTarget | null = null) => {
    const e = new Event(tur, { cancelable: true });
    Object.defineProperty(e, "target", { value: hedef });
    return e;
  };

  it("paneli kapatan pointerdown'dan sonraki click durdurulur; sonraki tıklamalar normal", () => {
    const belge = new EventTarget();
    let alttakiTiklandi = 0;
    const kapanma: string[] = [];
    const birak = disariTiklamaDinle(belge, () => false, (n) => kapanma.push(n), { tiklamayiYut: true });
    belge.dispatchEvent(olay("pointerdown"));
    // Gerçek DOM'da belgenin yakalama dinleyicisi alt öğeninkinden önce çalışır; burada sonra eklenerek taklit edilir.
    belge.addEventListener("click", () => alttakiTiklandi++);
    const ilk = olay("click");
    belge.dispatchEvent(ilk);
    expect(kapanma).toEqual(["disari"]);
    expect(ilk.defaultPrevented).toBe(true);
    expect(alttakiTiklandi).toBe(0);
    birak();
    belge.dispatchEvent(olay("click"));
    expect(alttakiTiklandi).toBe(1);
  });

  it("seçenek verilmezse (menüler) tıklama yutulmaz; yutucu süre dolunca kendini kaldırır", async () => {
    const belge = new EventTarget();
    let tik = 0;
    belge.addEventListener("click", () => tik++);
    const birak = disariTiklamaDinle(belge, () => false, () => {});
    belge.dispatchEvent(olay("pointerdown"));
    belge.dispatchEvent(olay("click"));
    expect(tik).toBe(1);
    birak();
    sonrakiTiklamayiYut(belge, 10);
    await new Promise((r) => setTimeout(r, 30));
    belge.dispatchEvent(olay("click"));
    expect(tik).toBe(2);
  });
});

describe("Kayıtlar tablosu", () => {
  const satir = (p: Partial<Parameters<typeof KayitTablosu>[0]["satirlar"][number]>) => ({
    id: Math.random().toString(36).slice(2),
    durum: "yeni" as const,
    iletiIzni: "bekliyor" as const,
    etiketler: [],
    isletmeAdi: null,
    yetkiliAdi: null,
    guncellemeTarihi: "2026-11-25T10:00:00.000Z",
    kaynak: "google" as const,
    inceleme: "ilgileniyor" as const,
    whatsappIzni: "var" as const,
    waPencereAcik: false,
    engelli: false,
    ...p,
  });

  it("kaydırma kabı relative (sr-only metinler sayfayı taşırmaz); Google'a gitmez, kayıtlı ad ya da yer tutucu", () => {
    const h = renderToStaticMarkup(
      createElement(KayitTablosu, {
        satirlar: [satir({ yetkiliAdi: "Can Örnek" }), satir({}), satir({ isletmeAdi: "Ege Emlak", yetkiliAdi: "Ayşe", kaynak: "elle" })],
        seciliId: null,
        seciliBaglantisi: (id) => `/kayitlar?secili=${id}`,
        onSec: () => {},
      }),
    );
    expect(h).toContain('<div class="relative overflow-x-auto">');
    expect(h).toContain('<span class="sr-only">WhatsApp izni var</span>');
    expect(h).not.toMatch(/>Göster<|Google bilgilerini göster|Yükleniyor/);
    expect(h).toMatch(/font-semibold">Can Örnek<\/span><span[^>]*>Google tarama<\/span>/);
    expect(h).toMatch(/text-soluk italic">Google kaydı · ad girilmemiş<\/span>/);
    expect(h).toMatch(/font-semibold">Ege Emlak<\/span><span[^>]*>Ayşe<\/span>/);
  });
});

describe("kampanya sihirbazı", () => {
  const s = oku("src/app/(app)/kampanyalar/yeni/kampanya-sihirbazi.tsx");

  it("şablon fieldset'i min-w-0 (uzun seçenek sayfayı taşırmaz)", () => {
    expect(s).toContain('<fieldset className="flex min-w-0 flex-col gap-3">');
  });

  it("görsel: tarayıcı dosya girişi gizli; yüklüyken ad + boyut ve 'Görseli değiştir', yokken 'Görsel seç'", () => {
    expect(s).toMatch(/<label className=\{`dugme dugme-kucuk relative cursor-pointer[^`]*`\}>\s*\{props\.gorsel \? "Görseli değiştir" : "Görsel seç"\}/);
    // Telefonda alt çubuğun açıklaması düğmelerin arasına sıkışmaz: kendi satırında, üstte.
    expect(s).toContain('<div className="min-w-0 flex-1 text-[13px] max-sm:order-first max-sm:basis-full">');
    expect(s).toMatch(/accept="image\/jpeg,image\/png"[\s\S]{0,300}className="sr-only"/);
    expect(s).toContain('<span className="shrink-0 text-soluk">· {sayiYaz(Math.ceil(props.gorsel.boyut / 1024))} KB</span>');
    expect(s).not.toContain('className="girdi text-[13px]"');
  });
});

describe("gelen kutusu", () => {
  const g = oku("src/app/(app)/gelen-kutusu/gelen-kutusu.tsx");

  it("yeni mesajda liste kabı alta iner; görsel sonradan yüklenince alttaysa altta kalır", () => {
    expect(g).toContain("if (el) el.scrollTop = el.scrollHeight;");
    expect(g).toMatch(/useEffect\(\(\) => \{\s*altta\.current = true;\s*altaIn\(\);\s*\}, \[sonId\]\);/);
    expect(g).toContain("onLoadCapture={() => {");
    expect(g).toContain("altta.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;");
    expect(g).not.toContain("scrollIntoView({ block: \"end\" })");
  });

  it("geniş ekranda sohbet kartı ekran yüksekliğiyle sınırlı: ek eklenince liste küçülür, Gönder görünür kalır", () => {
    expect(g).toContain('<div className="kart flex min-w-0 flex-col !p-0 lg:h-[calc(100dvh-9rem)] lg:min-h-[520px]">');
    expect(g).toContain("lg:max-h-none lg:min-h-[160px]");
  });
});

// ——— 2. tur ———

describe("gelen kutusu: şablon iletisi balonu ve liste önizlemesi", () => {
  it("sablonParcala: görsel, başlık, gövde, alt bilgi ve butonlar ayrılır; tanınmayan metin gövde kalır", async () => {
    const { sablonParcala } = await import("@/lib/gelen-kutusu");
    expect(sablonParcala("[Görsel]\n\nMerhaba Ege, *yeni* portföy.\n\n_Almak istemiyorsanız dokunun._\n\n[Portföyü incele] [Abonelikten çık]")).toEqual({
      baslikMedyasi: "Görsel",
      baslik: null,
      govde: "Merhaba Ege, *yeni* portföy.",
      altbilgi: "Almak istemiyorsanız dokunun.",
      butonlar: ["Portföyü incele", "Abonelikten çık"],
    });
    expect(sablonParcala("*Merhaba Ege*\n\nRandevunuz yarın.")).toMatchObject({ baslik: "Merhaba Ege", govde: "Randevunuz yarın.", butonlar: [] });
    expect(sablonParcala("[Fiyat] sorusu")).toMatchObject({ baslikMedyasi: null, govde: "[Fiyat] sorusu", butonlar: [] });
  });

  it("mesajOzeti: okunur önizleme (📎 Belge: dosya, 🖼 Fotoğraf: açıklama, şablonda ham işaretler yok)", async () => {
    const { mesajOzeti } = await import("@/lib/gelen-kutusu");
    expect(mesajOzeti({ tur: "document", metin: null, dosyaAdi: "teklif.pdf" })).toBe("📎 Belge: teklif.pdf");
    expect(mesajOzeti({ tur: "image", metin: null })).toBe("🖼 Fotoğraf");
    expect(mesajOzeti({ tur: "image", metin: "Salon" })).toBe("🖼 Fotoğraf: Salon");
    expect(mesajOzeti({ tur: "audio", metin: null })).toBe("🎤 Ses kaydı");
    expect(mesajOzeti({ tur: "template", metin: "[Görsel]\n\nMerhaba *Ege*, hazır.\n\n_Alt_\n\n[Çık]" })).toBe("🖼 Merhaba Ege, hazır.");
    expect(mesajOzeti({ tur: "text", metin: "Selam" })).toBe("Selam");
    expect(mesajOzeti({ tur: "text", metin: "x", icerikSilindi: true })).toBe("(içerik saklama süresi doldu)");
  });

  it("WhatsApp biçimlendirmesi HTML değil React düğümü: kalın / italik / üstü çizili; işaretsiz metin aynen", async () => {
    const { WhatsappMetni } = await import("@/app/(app)/gelen-kutusu/gelen-kutusu");
    const h = renderToStaticMarkup(createElement(WhatsappMetni, { metin: "Fiyat *4.250.000 TL* _pazarlıklı_ ~eski~ <b>x</b>" }));
    expect(h).toBe("Fiyat <strong>4.250.000 TL</strong> <em>pazarlıklı</em> <s>eski</s> &lt;b&gt;x&lt;/b&gt;");
  });

  it("balon şablon iletisini parçalarıyla çizer: görsel küçük resmi, butonlar ayrı satırlar", () => {
    const g = oku("src/app/(app)/gelen-kutusu/gelen-kutusu.tsx");
    expect(g).toContain('<SablonIletisi metin={metin} gorsel={m.sablonGorseli ?? null} />');
    expect(g).toContain('<ul aria-label="Şablon butonları"');
    expect(g).toContain('alt="Kampanya görseli"');
  });
});

describe("kampanya alıcıları: varsayılan sıra ve sabit sütunlar", () => {
  it("gönderilenler önce, hariçler sonda; aynı durumdakiler eklenme sırasıyla", async () => {
    const kampanyalar = await import("@/server/repo/kampanyalar");
    const kayitlar = await import("@/server/repo/kayitlar");
    const { db } = await import("@/server/db");
    const { kiraciOlustur } = await import("./yardimci/fabrika");
    const { ctx } = kiraciOlustur(`Sira${Math.random().toString(36).slice(2, 7)}`);
    const kisiler = kayitlar.kisileriEkle(ctx, ["A", "B", "C", "D", "E"].map((ad, i) => ({ kaynak: "elle" as const, isletmeAdi: ad, eposta: `s${i}@ornek.test` })), "t");
    const k = kampanyalar.kampanyaOlustur(
      ctx,
      { kanal: "eposta", ad: "Sıra", konu: "K", sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null },
      kisiler.map((x, i) => ({ leadId: x.id, haric: i < 2 ? ("ret" as const) : undefined })),
    );
    const id = (ad: string) => kampanyalar.kampanyaMesajlari(ctx, k.id).mesajlar.find((m) => m.isletmeAdi === ad)!.id;
    db.$client.prepare("update message_queue set durum = 'gonderildi' where id = ?").run(id("E"));
    db.$client.prepare("update message_queue set durum = 'basarisiz' where id = ?").run(id("D"));
    expect(kampanyalar.kampanyaMesajlari(ctx, k.id).mesajlar.map((m) => [m.isletmeAdi, m.durum])).toEqual([
      ["E", "gonderildi"],
      ["D", "basarisiz"],
      ["C", "kuyrukta"],
      ["A", "haric"],
      ["B", "haric"],
    ]);
  });

  it("alıcı tablosu table-fixed + colgroup (süzgeç değişince sütunlar zıplamaz)", () => {
    const d = oku("src/app/(app)/kampanyalar/[id]/kampanya-detayi.tsx");
    expect(d).toContain('<table className="w-full min-w-[560px] table-fixed text-sm break-words">');
    expect(d).toMatch(/<colgroup>\s*<col className="w-\[40%\]" \/>\s*<col className="w-\[28%\]" \/>\s*<col \/>\s*<\/colgroup>/);
  });
});

describe("Kayıtlar: Filtreler paneli yüksekliği, boş liste, toplu işlem önizlemesi", () => {
  it("panel ekranın altından taşıyorsa sınırlanır (içi kayar, en az 240 px); Uygula alta yapışık", async () => {
    const { panelYuksekligi } = await import("@/components/arayuz/acilir-panel");
    expect(panelYuksekligi(120, 600, 850)).toBeNull();
    expect(panelYuksekligi(120, 900, 850)).toBe(718);
    expect(panelYuksekligi(700, 900, 850)).toBe(240);
    expect(oku("src/app/(app)/kayitlar/page.tsx")).toContain('<div className="sticky -bottom-5 z-10 -mx-5 flex flex-wrap gap-2 border-t border-cizgi bg-white px-5 pt-3 pb-5">');
  });

  it("süzgeç / arama etkinken boş liste 'Süzgeçleri temizle' der; süzgeçsizken yeni kayıt önerir", () => {
    const ortak = { satirlar: [], seciliId: null, seciliBaglantisi: (id: string) => id, onSec: () => {} };
    const suzgecli = renderToStaticMarkup(createElement(KayitTablosu, { ...ortak, bosListe: { temizAdres: "/kayitlar?grup=tum" } }));
    expect(suzgecli).toContain("Bu süzgeçlere uyan kayıt yok.");
    expect(suzgecli).toContain('<a class="font-medium text-ana" href="/kayitlar?grup=tum">Süzgeçleri temizle</a>');
    expect(suzgecli).not.toContain("Bölge tara");
    const bos = renderToStaticMarkup(createElement(KayitTablosu, ortak));
    expect(bos).toContain("Bölge tara");
  });

  it("onay penceresi metni: seçili, değişecek ve atlanacak kayıtlar (tek neden adıyla, çok neden sayılarıyla)", async () => {
    const { onizlemeMetni } = await import("@/app/(app)/kayitlar/toplu-islem");
    const sifir = { ayni: 0, ret: 0, engelli: 0, whatsapp_yok: 0, meta_reklam: 0, etiket_siniri: 0 };
    expect(onizlemeMetni("whatsapp_izni", 4, { hedef: 4, degisen: 3, atlanan: { ...sifir, ayni: 1 }, bulunamayan: 0 })).toBe(
      "4 seçili · 3 kayda kaydedilecek, 1 atlanacak: zaten izinli.",
    );
    expect(onizlemeMetni("whatsapp_izni", 6, { hedef: 6, degisen: 2, atlanan: { ...sifir, ayni: 1, ret: 3 }, bulunamayan: 0 })).toBe(
      "6 seçili · 2 kayda kaydedilecek, 4 atlanacak: 1 zaten izinli, 3 RET vermiş.",
    );
    expect(onizlemeMetni("etiket_ekle", 2, { hedef: 2, degisen: 2, atlanan: sifir, bulunamayan: 0 })).toBe("2 seçili · 2 kayda eklenecek.");
    const t = oku("src/app/(app)/kayitlar/toplu-islem.tsx");
    expect(t).toContain("govde: { onizleme: true, secim: props.secim, islem }");
    expect(t).toMatch(/pencere\.current\?\.showModal\(\);\s*void onizlemeAl\(\);/);
  });
});

describe("kayıt ayrıntı paneli: Google kaynak notu ve başlık", () => {
  it("not sayı / birim içermez: Google'dan geldiyse aylık kullanımdan düştüğünü, önbellekten geldiyse onu söyler", async () => {
    const { googleKaynakNotu } = await import("@/lib/google-kaynak-notu");
    expect(googleKaynakNotu({ tur: "google" })).toBe("Google'dan getirildi · aylık kullanımdan düşer");
    expect(googleKaynakNotu({ tur: "onbellek" })).toBe("Önbellekten getirildi");
  });

  it("başlık listedeki kayıtlı ad (satirAdi); Google'daki ad farklıysa altında 'Google'daki adı: …'", () => {
    const panel = oku("src/app/(app)/kayitlar/detay-paneli.tsx");
    expect(panel).toContain('import { satirAdi } from "./kayit-tablosu";');
    expect(panel).toContain("const googleAdi = google && yer?.ad && yer.ad !== baslik ? yer.ad : null;");
    expect(panel).toMatch(/<h2[^>]*>\{baslik\}<\/h2>\s*\{googleAdi && <span[^>]*>Google&apos;daki adı: \{googleAdi\}<\/span>\}/);
  });
});

// ——— 3. tur ———

describe("3. tur: adım çubuğu, Kayıtta boşsa, yapıştırma adı, PDF boyutu, kaydırma çubuğu yeri", () => {
  it("13: adım çubuğu tek satır; dar ekranda yalnızca etkin adımın adı görünür, diğerleri ekran okuyucuya kalır", async () => {
    const { vi } = await import("vitest");
    vi.doMock("next/navigation", async (asil) => ({
      ...(await asil<typeof import("next/navigation")>()),
      useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
    }));
    const { KampanyaSihirbazi } = await import("@/app/(app)/kampanyalar/yeni/kampanya-sihirbazi");
    const h = renderToStaticMarkup(
      createElement(KampanyaSihirbazi, {
        adim: "2",
        ilkKanal: "eposta",
        etiketler: [],
        saglayicilar: { eposta: { tanimli: true }, sms: { tanimli: false } } as Parameters<typeof KampanyaSihirbazi>[0]["saglayicilar"],
        eksikAyarlar: [],
        smsAltbilgisi: "",
        whatsapp: { yonetici: false, numaralar: [] },
      }),
    );
    const ol = h.slice(h.indexOf('aria-label="Adımlar"') - 80, h.indexOf("</ol>"));
    expect(ol).toContain("flex-nowrap");
    expect(ol).not.toContain("flex-wrap ");
    expect(ol).toMatch(/aria-current="step"[^]*?<span class="whitespace-nowrap font-semibold ">Alıcılar<\/span>/);
    for (const ad of ["Kanal", "Mesaj", "Gönder"]) expect(ol).toMatch(new RegExp(`max-sm:sr-only">${ad}</span>`));
    vi.doUnmock("next/navigation");
  });

  it("14: 'Kayıtta boşsa' seçimle aynı hizada (açıklama kutunun altında); yedek değer önizlemede ve ayrıntılarda", async () => {
    const s = oku("src/app/(app)/kampanyalar/yeni/kampanya-sihirbazi.tsx");
    expect(s).toContain('<div key={anahtar} className="grid items-start gap-2 sm:grid-cols-3">');
    expect(s).toMatch(/Kayıtta boşsa\s*<input[\s\S]*?\/>\s*<span className="text-xs font-normal text-soluk">Boş bırakılırsa/);
    const { WhatsappOnizlemesi, SablonAyrintilari, yedekMetni } = await import("@/app/(app)/kampanyalar/yeni/mesaj-onizlemesi");
    const sablon = {
      id: "s",
      wabaId: "w",
      ad: "t",
      dil: "tr",
      kategori: "MARKETING",
      degiskenler: [
        { bilesen: "body", ad: "1" },
        { bilesen: "body", ad: "2" },
      ],
      bilesenler: [{ type: "BODY", text: "Merhaba {{1}}, {{2}}." }],
    } as unknown as Parameters<typeof SablonAyrintilari>[0]["sablon"];
    const eslem = { "body:1": { kaynak: "isletme_adi" as const, yedek: "Değerli müşterimiz" }, "body:2": { kaynak: "yetkili_adi" as const } };
    const onizleme = renderToStaticMarkup(createElement(WhatsappOnizlemesi, { numara: "N", sablon, eslem, gorselAdresi: null }));
    expect(onizleme).toContain("Kayıtta boşsa: <span>Gövde {{1}} → &quot;Değerli müşterimiz&quot;</span>");
    const ayrinti = renderToStaticMarkup(createElement(SablonAyrintilari, { sablon, eslem }));
    expect(ayrinti).toContain("Gövde {{1}} → Kaydın işletme adı (boşsa: &quot;Değerli müşterimiz&quot;)");
    expect(ayrinti).toContain("(boşsa alıcı hariç tutulur)");
    expect(yedekMetni({ kaynak: "isletme_adi", yedek: "  " })).toBe("boşsa alıcı hariç tutulur");
  });

  it("16: yapıştırılan dosyanın adı İstanbul saatiyle; PDF balonunda boyut bölünmez", async () => {
    const { panoDosyaAdi } = await import("@/app/(app)/gelen-kutusu/ekler");
    expect(panoDosyaAdi(new Date("2026-11-25T13:17:01Z"))).toBe("ekran-goruntusu-2026-11-25-16-17-01.png");
    expect(panoDosyaAdi(new Date("2026-11-25T22:05:09Z"))).toBe("ekran-goruntusu-2026-11-26-01-05-09.png");
    expect(oku("src/app/(app)/gelen-kutusu/gelen-kutusu.tsx")).toContain(
      '{medya.boyut !== null && <span className="whitespace-nowrap"> ({boyutYaz(medya.boyut)})</span>}',
    );
  });

  it("17: kaydırma çubuğunun yeri her zaman ayrılır (kısa sayfada düzen kaymaz)", () => {
    expect(oku("src/app/globals.css")).toMatch(/html \{\s*scrollbar-gutter: stable;\s*\}/);
  });
});
