"use client";
// Ayarlar → Gönderen bilgileri, Saatler ve sınırlar, WhatsApp listesi, SMS ve E-posta bölümleri.
// Her bölüm ayrı sayfadadır; API'ler değişmedi (/api/ayarlar/ileti, /api/ayarlar/saglayicilar/*).
// Sağlayıcı kimlik bilgileri sunucudan hiçbir zaman geri gelmez: yalnızca "tanımlı / tanımlı değil".
import { useState } from "react";
import { IstatistikKutusu } from "@/components/arayuz/gosterge";
import { AyarSatiri, Kart, KaydetCubugu } from "@/components/arayuz/kart";
import { BilgiNotu } from "@/components/arayuz/not";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { SonucMesaji } from "@/components/bildirim";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import {
  pencereDakikasi,
  pencereSaati,
  SMTP_IZINLI_PORTLAR,
  TEST_GONDERIM_SAATLIK_SINIR,
  WHATSAPP_AZAMI_GUNLUK,
  ZORUNLU_ONAY_METNI,
} from "@/lib/mesajlasma";
import { SINIR_ARTIRMA_METNI } from "@/lib/sabitler";
import { sablonDoldur, whatsappAltbilgisi } from "@/lib/sablon";
import type { MesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";

type Mesaj = { tur: "hata" | "tamam"; metin: string } | null;
const SALT_OKUNUR = "Bu ayarları yalnızca yöneticiler değiştirebilir.";

/** Bölümün ayarları, kayıt isteği ve sonuç mesajı. */
function useAyarlar(ilk: MesajlasmaAyarlariDto) {
  const [a, setA] = useState(ilk);
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [mesgul, setMesgul] = useState(false);
  const [webhookAdresi, setWebhookAdresi] = useState<string | null>(null);

  async function gonder(url: string, method: "PUT" | "DELETE" | "POST", govde?: unknown, tamam?: string) {
    setMesgul(true);
    setMesaj(null);
    const s = await apiIstek<{ ayarlar?: MesajlasmaAyarlariDto; mesaj?: string; webhookAdresi?: string }>(url, { method, govde });
    setMesgul(false);
    if (!s.ok) {
      setMesaj({ tur: "hata", metin: s.hata });
      return false;
    }
    if (s.veri.ayarlar) setA(s.veri.ayarlar);
    if (s.veri.webhookAdresi) setWebhookAdresi(s.veri.webhookAdresi);
    setMesaj({ tur: "tamam", metin: s.veri.mesaj ?? tamam ?? "Kaydedildi." });
    return true;
  }

  // Kayıttan sonra formlar güncel değerlerle yeniden oluşsun.
  return { a, mesaj, mesgul, webhookAdresi, gonder, surum: JSON.stringify(a) };
}

function MesajSatiri({ mesaj }: { mesaj: Mesaj }) {
  if (!mesaj) return null;
  // Görünür alana kaydırılır; başarılıysa sağ üstte bildirim olarak da gösterilir.
  return (
    <div className="px-7 pb-4">
      <SonucMesaji key={mesaj.metin} tur={mesaj.tur} metin={mesaj.metin} />
    </div>
  );
}

function BaglantiSatiri(props: { tanimli: boolean; tanimsizMetni: string; guncellemeTarihi: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-7 py-5">
      <DurumRozeti ton={props.tanimli ? "ana" : "notr"}>{props.tanimli ? "Bağlı" : "Bağlı değil"}</DurumRozeti>
      <span className="text-soluk">
        {props.tanimli
          ? props.guncellemeTarihi
            ? `Son güncelleme: ${tarihYaz(props.guncellemeTarihi)}`
            : "Bilgiler kayıtlı."
          : props.tanimsizMetni}
      </span>
    </div>
  );
}

export function GonderenAyarlari(props: { ilk: MesajlasmaAyarlariDto }) {
  const { a, mesaj, mesgul, gonder, surum } = useAyarlar(props.ilk);
  return (
    <Kart>
      <form
        key={`ticari-${surum}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void gonder("/api/ayarlar/ileti", "PUT", {
            gonderenUnvani: String(f.get("gonderenUnvani") ?? ""),
            iletisimBilgisi: String(f.get("iletisimBilgisi") ?? ""),
            iysNo: String(f.get("iysNo") ?? ""),
            sorumlulukOnayi: f.get("sorumlulukOnayi") === "on",
          });
        }}
      >
        <fieldset disabled={mesgul}>
          <AyarSatiri baslik="Gönderen unvanı" aciklama="Şirketinizin resmi adı; her mesajın altına eklenir." alanId="tc-unvan">
            <input id="tc-unvan" name="gonderenUnvani" defaultValue={a.gonderenUnvani ?? ""} maxLength={160} className="girdi" placeholder="Ör. Ege Emlak Danışmanlık Ltd. Şti." />
          </AyarSatiri>
          <AyarSatiri baslik="İletişim bilgisi" aciklama="Adres, telefon veya web sitesi; alıcılar size buradan ulaşır." alanId="tc-iletisim">
            <input id="tc-iletisim" name="iletisimBilgisi" defaultValue={a.iletisimBilgisi ?? ""} maxLength={300} className="girdi" />
          </AyarSatiri>
          <AyarSatiri baslik="İYS numarası" aciklama="İleti Yönetim Sistemi'ndeki kayıt numaranız." alanId="tc-iys">
            <input id="tc-iys" name="iysNo" defaultValue={a.iysNo ?? ""} maxLength={40} className="girdi" />
          </AyarSatiri>
          <AyarSatiri
            baslik="Sorumluluk beyanı"
            aciklama={a.sorumlulukOnayTarihi ? `Onay tarihi: ${tarihYaz(a.sorumlulukOnayTarihi)}` : "Gerçek kampanya göndermek için gerekli."}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="sorumlulukOnayi" defaultChecked={a.sorumlulukOnayi} className="mt-0.5 size-5 shrink-0 accent-ana" />
              <span>{ZORUNLU_ONAY_METNI}</span>
            </label>
          </AyarSatiri>
        </fieldset>
        {a.eksikAyarlar.length > 0 && (
          <div className="px-7 pb-4">
            <BilgiNotu ton="uyari">Gerçek gönderim için eksik: {a.eksikAyarlar.join(", ")}. Eksikler tamamlanana kadar yalnızca test kampanyası başlatılabilir.</BilgiNotu>
          </div>
        )}
        <MesajSatiri mesaj={mesaj} />
        <KaydetCubugu>
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            Kaydet
          </button>
        </KaydetCubugu>
      </form>
    </Kart>
  );
}

export function SaatlerAyarlari(props: { ilk: MesajlasmaAyarlariDto; yonetici: boolean }) {
  const { a, mesaj, mesgul, gonder, surum } = useAyarlar(props.ilk);
  return (
    <Kart>
      <form
        key={`saat-${surum}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void gonder("/api/ayarlar/ileti", "PUT", {
            gonderimBaslangicDk: pencereDakikasi(String(f.get("baslangic")), "baslangic"),
            gonderimBitisDk: pencereDakikasi(String(f.get("bitis")), "bitis"),
          });
        }}
      >
        <fieldset disabled={!props.yonetici || mesgul}>
          <AyarSatiri
            baslik="Gönderim saatleri"
            aciklama="İstanbul saatiyle. Bu aralığın dışındaki mesajlar ertesi günü bekler. Bitişte 00:00, gün sonu (gece yarısı) demektir."
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                Başlangıç
                <input type="time" name="baslangic" required defaultValue={pencereSaati(a.gonderimBaslangicDk, "baslangic")} className="girdi w-auto" />
              </label>
              <label className="flex items-center gap-2">
                Bitiş
                <input type="time" name="bitis" required defaultValue={pencereSaati(a.gonderimBitisDk, "bitis")} className="girdi w-auto" />
              </label>
            </div>
          </AyarSatiri>
        </fieldset>
        <AyarSatiri baslik="Günlük sınırlar" aciklama="Sınıra takılan mesajlar ertesi güne kalır.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <IstatistikKutusu baslik="E-posta" deger={`${sayiYaz(a.gunlukSinirlar.eposta)} / gün`} />
            <IstatistikKutusu baslik="SMS" deger={`${sayiYaz(a.gunlukSinirlar.sms)} / gün`} />
            <IstatistikKutusu baslik="WhatsApp listesi" deger={`${sayiYaz(a.whatsappGunlukSinir)} / kişi`} />
          </div>
        </AyarSatiri>
        <MesajSatiri mesaj={mesaj} />
        <KaydetCubugu aciklama={props.yonetici ? SINIR_ARTIRMA_METNI : `${SALT_OKUNUR} ${SINIR_ARTIRMA_METNI}`}>
          {props.yonetici && (
            <button type="submit" className="dugme-ana" disabled={mesgul}>
              Kaydet
            </button>
          )}
        </KaydetCubugu>
      </form>
    </Kart>
  );
}

export function WhatsappListesiAyarlari(props: { ilk: MesajlasmaAyarlariDto; yonetici: boolean }) {
  const { a, mesaj, mesgul, gonder, surum } = useAyarlar(props.ilk);
  const [sablon, setSablon] = useState(a.whatsappSablonu ?? "Merhaba {isletme}, ");
  const ornek = `${sablonDoldur(sablon, "Örnek İşletme")}\n\n${whatsappAltbilgisi(a.gonderenUnvani)}`;
  return (
    <Kart>
      <form
        key={`wa-${surum}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const sinir = String(f.get("whatsappGunlukSinir") ?? "").trim();
          void gonder("/api/ayarlar/ileti", "PUT", { whatsappSablonu: sablon, whatsappGunlukSinir: sinir ? Number(sinir) : null });
        }}
      >
        <fieldset disabled={!props.yonetici || mesgul}>
          <AyarSatiri
            baslik="Mesaj şablonu"
            aciklama={
              <>
                {"{isletme}"} kaydın &quot;İşletme adı (sizin kaydınız)&quot; alanıyla dolar. Sonuna gönderen unvanı ve
                &quot;RET yazmanız yeterli&quot; notu eklenir.
              </>
            }
            alanId="wa-sablon"
          >
            <textarea id="wa-sablon" value={sablon} onChange={(e) => setSablon(e.target.value)} rows={4} maxLength={1000} className="girdi" />
            <div className="mt-3 rounded-[10px] bg-ic-kutu p-4">
              <p className="mb-1 text-xs font-semibold text-soluk">Önizleme</p>
              <p className="whitespace-pre-wrap break-words">{ornek}</p>
            </div>
          </AyarSatiri>
          <AyarSatiri baslik="Kişi başına günlük sınır" aciklama={`En fazla ${WHATSAPP_AZAMI_GUNLUK}. Gün İstanbul saatiyle sıfırlanır.`} alanId="wa-sinir">
            <input
              id="wa-sinir"
              name="whatsappGunlukSinir"
              type="number"
              min={1}
              max={WHATSAPP_AZAMI_GUNLUK}
              defaultValue={a.whatsappSinirOzel ?? ""}
              placeholder={`Varsayılan (${a.whatsappGunlukSinir})`}
              className="girdi max-w-48"
            />
          </AyarSatiri>
        </fieldset>
        <MesajSatiri mesaj={mesaj} />
        <KaydetCubugu aciklama={props.yonetici ? undefined : SALT_OKUNUR}>
          {props.yonetici && (
            <button type="submit" className="dugme-ana" disabled={mesgul}>
              Kaydet
            </button>
          )}
        </KaydetCubugu>
      </form>
    </Kart>
  );
}

export function SmsAyarlari(props: { ilk: MesajlasmaAyarlariDto }) {
  const { a, mesaj, mesgul, webhookAdresi, gonder, surum } = useAyarlar(props.ilk);
  const sms = a.saglayicilar.sms;
  return (
    <>
      <Kart>
        <BaglantiSatiri tanimli={sms.tanimli} guncellemeTarihi={sms.guncellemeTarihi} tanimsizMetni="Bağlanana kadar SMS kampanyaları test modunda kalır (gerçek gönderim yapılmaz)." />
        <form
          key={`sms-${surum}`}
          className="border-t border-cizgi"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const yenile = f.get("webhookYenile") === "on";
            const tamam = await gonder(
              `/api/ayarlar/saglayicilar/sms${yenile ? "?webhookYenile=1" : ""}`,
              "PUT",
              { kullanici: String(f.get("kullanici") ?? ""), sifre: String(f.get("sifre") ?? ""), baslik: String(f.get("baslik") ?? "") },
              "Netgsm bilgileri kaydedildi.",
            );
            if (tamam) form.reset();
          }}
        >
          <fieldset disabled={mesgul}>
            <AyarSatiri
              baslik="Hesap bilgileri"
              aciklama={sms.tanimli ? "Tanımlı. Değiştirmek için üç alanı da yeniden girin; şifre bir daha gösterilmez." : "Netgsm kullanıcı kodu, API şifresi ve onaylı başlığınız."}
            >
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5 text-[13px] text-soluk">
                  Netgsm kullanıcı kodu
                  <input name="kullanici" required maxLength={40} className="girdi" autoComplete="off" />
                </label>
                <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5 text-[13px] text-soluk">
                  API şifresi
                  <input name="sifre" type="password" required maxLength={200} className="girdi" autoComplete="new-password" />
                </label>
                <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5 text-[13px] text-soluk">
                  SMS başlığı
                  <input name="baslik" required maxLength={11} className="girdi font-mono" placeholder="Ör. EGEEMLAK" />
                </label>
              </div>
              {sms.tanimli && (
                <label className="mt-3 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="webhookYenile" className="accent-ana" /> Gelen SMS adresini de yenile (eski adres çalışmaz)
                </label>
              )}
            </AyarSatiri>
          </fieldset>
          {webhookAdresi && (
            <div className="px-7 pb-4">
              <BilgiNotu ton="uyari">
                <p className="font-semibold">Gelen SMS adresi (yalnızca şimdi gösterilir)</p>
                <input readOnly value={webhookAdresi} className="girdi mt-2 font-mono text-[13px]" aria-label="Gelen SMS adresi" onFocus={(e) => e.currentTarget.select()} />
                <p className="mt-2">
                  Bu adresi Netgsm panelinde gelen SMS yönlendirmesi olarak tanımlayın; RET yanıtları böyle işlenir. Adres
                  gizlidir, kaybederseniz yenileyin.
                </p>
              </BilgiNotu>
            </div>
          )}
          <MesajSatiri mesaj={mesaj} />
          <KaydetCubugu aciklama={sms.tanimli ? `Test SMS'i yalnızca yetkili cep telefonuna gider (saatte en fazla ${TEST_GONDERIM_SAATLIK_SINIR}).` : undefined}>
            {sms.tanimli && (
              <>
                <button type="button" className="dugme-tehlike" disabled={mesgul} onClick={() => void gonder("/api/ayarlar/saglayicilar/sms", "DELETE", undefined, "Netgsm bilgileri kaldırıldı.")}>
                  Kaldır
                </button>
                <button type="button" className="dugme" disabled={mesgul} onClick={() => void gonder("/api/ayarlar/saglayicilar/sms/test", "POST")}>
                  Kendime test SMS&apos;i gönder
                </button>
              </>
            )}
            <button type="submit" className="dugme-ana" disabled={mesgul}>
              {sms.tanimli ? "Bilgileri değiştir" : "Kaydet"}
            </button>
          </KaydetCubugu>
        </form>
      </Kart>

      <SmsGonderimAyarlari ilk={a} />
    </>
  );
}

/** Ret numarası ve yetkili telefonu (ticari ileti ayarlarının SMS kısmı). */
function SmsGonderimAyarlari(props: { ilk: MesajlasmaAyarlariDto }) {
  const { a, mesaj, mesgul, gonder, surum } = useAyarlar(props.ilk);
  return (
    <Kart>
      <form
        key={`smsayar-${surum}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void gonder("/api/ayarlar/ileti", "PUT", {
            smsRetNumarasi: String(f.get("smsRetNumarasi") ?? ""),
            yetkiliTelefonu: String(f.get("yetkiliTelefonu") ?? ""),
          });
        }}
      >
        <fieldset disabled={mesgul}>
          <AyarSatiri baslik="Ret numarası" aciklama={`Gelen SMS alabilen numaranız; her SMS'in sonuna "RET yazıp bu numaraya gönderin" olarak eklenir.`} alanId="sms-ret">
            <input id="sms-ret" name="smsRetNumarasi" defaultValue={a.smsRetNumarasi ?? ""} maxLength={20} inputMode="tel" className="girdi" placeholder="Ör. 0850 000 00 00" />
          </AyarSatiri>
          <AyarSatiri baslik="Yetkili cep telefonu" aciklama="Test SMS'leri yalnızca bu numaraya gider." alanId="sms-yetkili">
            <input id="sms-yetkili" name="yetkiliTelefonu" defaultValue={a.yetkiliTelefonu ?? ""} maxLength={20} inputMode="tel" className="girdi" placeholder="05XX XXX XX XX" />
          </AyarSatiri>
        </fieldset>
        <MesajSatiri mesaj={mesaj} />
        <KaydetCubugu>
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            Kaydet
          </button>
        </KaydetCubugu>
      </form>
    </Kart>
  );
}

export function EpostaAyarlari(props: { ilk: MesajlasmaAyarlariDto }) {
  const { a, mesaj, mesgul, gonder, surum } = useAyarlar(props.ilk);
  const smtp = a.saglayicilar.eposta;
  const etiket = "flex min-w-0 flex-col gap-1.5 text-[13px] text-soluk";
  return (
    <Kart>
      <BaglantiSatiri tanimli={smtp.tanimli} guncellemeTarihi={smtp.guncellemeTarihi} tanimsizMetni="Bağlanana kadar e-posta kampanyaları test modunda kalır (gerçek gönderim yapılmaz)." />
      <form
        key={`smtp-${surum}`}
        className="border-t border-cizgi"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const tamam = await gonder(
            "/api/ayarlar/saglayicilar/eposta",
            "PUT",
            {
              sunucu: String(f.get("sunucu") ?? ""),
              port: Number(f.get("port")),
              kullanici: String(f.get("kullanici") ?? ""),
              sifre: String(f.get("sifre") ?? ""),
              gonderen: String(f.get("gonderen") ?? ""),
            },
            "SMTP bilgileri kaydedildi.",
          );
          if (tamam) form.reset();
        }}
      >
        <fieldset disabled={mesgul}>
          <AyarSatiri
            baslik="Sunucu"
            aciklama="E-posta sağlayıcınızın verdiği SMTP bilgileri. Yalnızca 25, 465, 587 ve 2525 portlarına ve herkese açık adreslere bağlanılır."
          >
            <div className="flex flex-wrap gap-3">
              <label className={`${etiket} flex-[3_1_200px]`}>
                Sunucu adresi
                <input name="sunucu" required maxLength={253} className="girdi" placeholder="smtp.alanadiniz.com" />
              </label>
              <label className={`${etiket} flex-[1_1_120px]`}>
                Port
                <select name="port" defaultValue="587" className="girdi">
                  {SMTP_IZINLI_PORTLAR.map((p) => (
                    <option key={p} value={p}>
                      {p}
                      {p === 465 ? " (SSL)" : p === 587 ? " (STARTTLS)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </AyarSatiri>
          <AyarSatiri baslik="Hesap" aciklama={smtp.tanimli ? "Tanımlı. Değiştirmek için bilgileri yeniden girin; şifre bir daha gösterilmez." : "Şifre şifrelenerek saklanır ve bir daha gösterilmez."}>
            <div className="flex flex-wrap gap-3">
              <label className={`${etiket} flex-[1_1_200px]`}>
                Kullanıcı adı
                <input name="kullanici" required maxLength={200} className="girdi" autoComplete="off" />
              </label>
              <label className={`${etiket} flex-[1_1_200px]`}>
                Şifre
                <input name="sifre" type="password" required maxLength={500} className="girdi" autoComplete="new-password" />
              </label>
            </div>
          </AyarSatiri>
          <AyarSatiri baslik="Gönderen adresi" aciklama="Alıcılar bu adresi görür." alanId="ep-gonderen">
            <input id="ep-gonderen" name="gonderen" type="email" required maxLength={200} className="girdi" placeholder="bilgi@alanadiniz.com" />
          </AyarSatiri>
        </fieldset>
        <MesajSatiri mesaj={mesaj} />
        <KaydetCubugu aciklama={smtp.tanimli ? `Test e-postası yalnızca kayıtlı gönderen adresinize gider (saatte en fazla ${TEST_GONDERIM_SAATLIK_SINIR}).` : undefined}>
          {smtp.tanimli && (
            <>
              <button type="button" className="dugme-tehlike" disabled={mesgul} onClick={() => void gonder("/api/ayarlar/saglayicilar/eposta", "DELETE", undefined, "SMTP bilgileri kaldırıldı.")}>
                Kaldır
              </button>
              <button type="button" className="dugme" disabled={mesgul} onClick={() => void gonder("/api/ayarlar/saglayicilar/eposta/test", "POST")}>
                Kendime test e-postası gönder
              </button>
            </>
          )}
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            {smtp.tanimli ? "Bilgileri değiştir" : "Bağla"}
          </button>
        </KaydetCubugu>
      </form>
    </Kart>
  );
}
