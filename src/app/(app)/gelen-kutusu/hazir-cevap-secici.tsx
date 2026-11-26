"use client";
// Yanıt kutusunun hazır cevap seçicisi: liste her açılışta sunucudan alınır (Ayarlar'daki değişiklik hemen görünür).
// Arama başlıkta ve metinde; ok tuşları ve Enter ile seçilir, Esc kapatır. Seçilen metin yanıt kutusuna konur;
// gönderim kullanıcı "Gönder"e basınca her zamanki yoldan yapılır.
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { apiIstek } from "@/lib/api-istemci";
import { hazirCevapAra, type HazirCevapDto } from "@/lib/hazir-cevaplar";

export function HazirCevapSecici(props: { onSec: (metin: string) => void; onKapat: () => void }) {
  const [cevaplar, setCevaplar] = useState<HazirCevapDto[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [etkin, setEtkin] = useState(0);
  const listeId = useId();
  const aramaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const iptal = new AbortController();
    // Seçici yüklenirken kapanırsa istek iptal edilir; apiIstek o zaman AbortError fırlatır (yutulur).
    apiIstek<{ cevaplar: HazirCevapDto[] }>("/api/hazir-cevaplar", { sinyal: iptal.signal })
      .then((y) => {
        if (iptal.signal.aborted) return;
        if (y.ok) setCevaplar(y.veri.cevaplar);
        else setHata(y.hata);
      })
      .catch(() => {});
    aramaRef.current?.focus();
    return () => iptal.abort();
  }, []);

  const sonuc = cevaplar ? hazirCevapAra(cevaplar, q) : [];
  const secili = Math.min(etkin, Math.max(sonuc.length - 1, 0));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-kenar bg-white p-3" role="dialog" aria-label="Hazır cevap seç">
      <input
        ref={aramaRef}
        type="search"
        className="girdi"
        placeholder="Hazır cevap ara"
        aria-label="Hazır cevap ara"
        role="combobox"
        aria-expanded="true"
        aria-controls={listeId}
        aria-activedescendant={sonuc[secili] ? `${listeId}-${sonuc[secili].id}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setEtkin(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.onKapat();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setEtkin(Math.min(secili + 1, sonuc.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setEtkin(Math.max(secili - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (sonuc[secili]) props.onSec(sonuc[secili].metin);
          }
        }}
      />
      {hata ? (
        <p className="text-sm text-tehlike">{hata}</p>
      ) : !cevaplar ? (
        <DonerGosterge etiket="Yükleniyor…" />
      ) : cevaplar.length === 0 ? (
        <p className="text-sm text-soluk">
          Henüz hazır cevap yok.{" "}
          <Link href="/ayarlar/hazir-cevaplar" className="font-medium text-ana-koyu underline">
            Ayarlar → Hazır cevaplar
          </Link>
        </p>
      ) : sonuc.length === 0 ? (
        <p className="text-sm text-soluk">Eşleşen hazır cevap yok.</p>
      ) : (
        <ul id={listeId} role="listbox" aria-label="Hazır cevaplar" className="flex max-h-64 flex-col overflow-y-auto">
          {sonuc.map((c, i) => (
            <li
              key={c.id}
              id={`${listeId}-${c.id}`}
              role="option"
              aria-selected={i === secili}
              className={`cursor-pointer rounded-md px-2 py-1.5 ${i === secili ? "bg-ana-acik" : "hover:bg-segment"}`}
              onMouseEnter={() => setEtkin(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onSec(c.metin)}
            >
              <p className="text-sm font-semibold break-words">{c.baslik}</p>
              <p className="line-clamp-2 text-xs break-words whitespace-pre-wrap text-metin-ikincil">{c.metin}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-soluk">
        <span>↑↓ seç · Enter yanıt kutusuna koyar · Esc kapatır</span>
        <Link href="/ayarlar/hazir-cevaplar" className="underline">
          Yönet
        </Link>
      </div>
    </div>
  );
}
