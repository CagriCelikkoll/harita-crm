"use client";
// Ayarlar → WhatsApp (Meta Business): çalışma alanının numaraları. Üstte numara sekmeleri ve "Numara ekle"; altta
// seçili numaranın kurulumu (WhatsappApiAyarlari). Her numaranın kendi test modu, test numaraları, uygulama payı,
// kalitesi, hesap kilidi ve bildirim adresi vardır; şablonlar numaranın WhatsApp hesabına (WABA) aittir.
import { useState } from "react";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { BAGLANTI_AZAMI } from "@/lib/whatsapp-api";
import { bosBaglantiDto, type BaglantiDto } from "@/lib/whatsapp-baglanti";
import type { SablonDto } from "@/server/servisler/whatsapp-api";
import { WhatsappApiAyarlari } from "./whatsapp-api-ayarlari";

const YENI = "yeni";

export function WhatsappNumaralari(props: { ilk: BaglantiDto[]; ilkSablonlar: Record<string, SablonDto[]>; ilkSecili: string | null }) {
  const [liste, setListe] = useState(props.ilk);
  const [sablonlar, setSablonlar] = useState(props.ilkSablonlar);
  const [secili, setSecili] = useState<string>(
    props.ilk.find((b) => b.id === props.ilkSecili)?.id ?? props.ilk[0]?.id ?? YENI,
  );
  // Yeni numara eklenince sekme değişir (bileşen yeniden kurulur): tek seferlik verify token burada taşınır.
  const [verifyToken, setVerifyToken] = useState<{ id: string; deger: string } | null>(null);

  const b = secili === YENI ? bosBaglantiDto() : (liste.find((x) => x.id === secili) ?? null);
  const listeyiGuncelle = (yeni: BaglantiDto[], gecilecek?: string | null, token?: string | null) => {
    setListe(yeni);
    const hedef = gecilecek && yeni.some((x) => x.id === gecilecek) ? gecilecek : yeni.some((x) => x.id === secili) ? secili : (yeni[0]?.id ?? YENI);
    if (token && gecilecek) setVerifyToken({ id: gecilecek, deger: token });
    setSecili(hedef);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="WhatsApp numaraları">
        {liste.map((n) => (
          <button
            key={n.id}
            type="button"
            role="tab"
            aria-selected={secili === n.id}
            onClick={() => setSecili(n.id!)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
              secili === n.id ? "border-ana bg-ana-acik text-ana" : "border-kenar bg-white hover:bg-kart-alt"
            }`}
          >
            {n.etiket}
            {n.hesapKilidi ? (
              <DurumRozeti ton="tehlike">Kilitli</DurumRozeti>
            ) : !n.numaraDogrulandi ? (
              <DurumRozeti ton="tehlike">Doğrulanmadı</DurumRozeti>
            ) : n.testModu ? (
              <DurumRozeti ton="uyari">Test modu</DurumRozeti>
            ) : null}
          </button>
        ))}
        {liste.length < BAGLANTI_AZAMI ? (
          <button
            type="button"
            role="tab"
            aria-selected={secili === YENI}
            onClick={() => setSecili(YENI)}
            className={`rounded-full border border-dashed px-4 py-2 text-sm font-semibold ${
              secili === YENI ? "border-ana bg-ana-acik text-ana" : "border-kenar text-ana hover:bg-kart-alt"
            }`}
          >
            + Numara ekle
          </button>
        ) : (
          <span className="text-[13px] text-soluk">En fazla {BAGLANTI_AZAMI} numara bağlanabilir.</span>
        )}
      </div>
      {b && (
        <WhatsappApiAyarlari
          key={secili}
          ilk={b}
          ilkSablonlar={(b.id && sablonlar[b.id]) || []}
          ilkVerifyToken={verifyToken && verifyToken.id === b.id ? verifyToken.deger : null}
          onListe={listeyiGuncelle}
          onSablonlar={(id, s) =>
            // Aynı WABA'daki numaralar ortak şablon kullanır: hepsinin listesi güncellenir.
            setSablonlar((eski) => {
              const waba = liste.find((x) => x.id === id)?.wabaId;
              const yeni = { ...eski };
              for (const n of liste) if (n.id && n.wabaId === waba) yeni[n.id] = s;
              return yeni;
            })
          }
        />
      )}
    </>
  );
}
