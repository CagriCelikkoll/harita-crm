// Netgsm SMS adaptörü (REST v2). Onaylı başlıkla, çalışma alanının kendi Netgsm hesabından gönderir.
//
// Doğrulanan alanlar — kaynak: Netgsm'in resmî Python SDK'sı (github.com/netgsm/netgsm-sms-python,
// netgsm/sms/sms_service.py, netgsm/exceptions/api_exception.py, tests/test_sms_service.py):
//   POST https://api.netgsm.com.tr/sms/rest/v2/send, HTTP Basic (kullanıcı kodu : API şifresi)
//   gövde: { msgheader, messages: [{ msg, no }], encoding?: "tr", iysfilter?: "0" | "11" | "12" }
//     iysfilter "0" bilgilendirme, "11" bireysele ticari, "12" tacire ticari (İYS kontrollü gönderim)
//   başarı: { code: "00", description, jobid }; hata: HTTP 406 + { code } (20, 30, 40, 50, 51, 70, 80, 85),
//   sistem hatası 100/101.
// Doğrulanmayan: başarı kodları 01/02'nin anlamı (topluluk kaynakları başarılı sayar; burada da öyle).
import "server-only";
import { turkceKodlamaGerekli } from "@/lib/sms-uzunluk";
import type { GonderimSonucu, Ileti, MessageProvider } from "./saglayici";

export type NetgsmBilgileri = {
  /** Netgsm kullanıcı kodu (abone numarası) ve API şifresi. */
  kullanici: string;
  sifre: string;
  /** Onaylı SMS başlığı (msgheader). */
  baslik: string;
};

export type NetgsmSecenekleri = { fetch?: typeof fetch; apiAdresi?: string; zamanAsimiMs?: number };

const HATA_ACIKLAMALARI: Record<string, string> = {
  "20": "Mesaj metni sorunlu ya da azami uzunluğu aşıyor",
  "30": "Geçersiz kullanıcı kodu / şifre ya da API erişimi yok (IP kısıtı olabilir)",
  "40": "Mesaj başlığı (gönderici adı) sistemde tanımlı değil",
  "50": "Abone hesabıyla İYS kontrollü gönderim yapılamıyor",
  "51": "Aboneliğe ait İYS marka bilgisi bulunamadı",
  "70": "Hatalı sorgu: parametrelerden biri hatalı ya da eksik",
  "80": "Gönderim sınırı aşıldı",
  "85": "Mükerrer gönderim sınırı aşıldı (aynı numaraya 1 dakikada 20'den fazla)",
  "100": "Netgsm sistem hatası",
  "101": "Netgsm sistem hatası",
};
/** İletinin gitmediği kesin ve sonra yeniden denenebilecek kodlar. */
const GECICI_KODLAR = new Set(["80", "85", "100", "101"]);
const BASARI_KODLARI = new Set(["00", "01", "02"]);

/** 90XXXXXXXXXX → Netgsm'in beklediği 5XXXXXXXXX. */
const netgsmNumarasi = (normal: string) => (normal.startsWith("90") ? normal.slice(2) : normal);

export function netgsmGovdesi(b: NetgsmBilgileri, ileti: Ileti, iysfilter: "0" | "11" | "12") {
  return {
    msgheader: b.baslik,
    messages: [{ msg: ileti.metin, no: netgsmNumarasi(ileti.alici) }],
    ...(turkceKodlamaGerekli(ileti.metin) ? { encoding: "tr" } : {}),
    iysfilter,
  };
}

/** Bağlantının hiç kurulamadığı (istek sunucuya ulaşmadı) hatalar: güvenle yeniden denenebilir. */
function baglantiKurulamadi(hata: unknown): boolean {
  const neden = (hata as { cause?: { code?: string } })?.cause?.code;
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(neden ?? "");
}

export function netgsmSaglayici(b: NetgsmBilgileri, s: NetgsmSecenekleri = {}): MessageProvider & {
  gonderBilgilendirme(ileti: Ileti): Promise<GonderimSonucu>;
} {
  const adres = `${(s.apiAdresi ?? process.env.NETGSM_API_URL ?? "https://api.netgsm.com.tr").replace(/\/+$/, "")}/sms/rest/v2/send`;
  const yetki = `Basic ${Buffer.from(`${b.kullanici}:${b.sifre}`, "utf8").toString("base64")}`;

  async function gonder(ileti: Ileti, iysfilter: "0" | "11" | "12"): Promise<GonderimSonucu> {
    let yanit: Response;
    try {
      yanit = await (s.fetch ?? fetch)(adres, {
        method: "POST",
        headers: { Authorization: yetki, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(netgsmGovdesi(b, ileti, iysfilter)),
        cache: "no-store",
        signal: AbortSignal.timeout(s.zamanAsimiMs ?? 30_000),
      });
    } catch (hata) {
      if (baglantiKurulamadi(hata)) return { durum: "gecici_hata", hata: "Netgsm'e bağlanılamadı." };
      return { durum: "kalici_hata", hata: "Netgsm yanıtı alınamadı (zaman aşımı); SMS gönderilmiş olabilir.", belirsiz: true };
    }
    const veri = (await yanit.json().catch(() => null)) as { code?: string | number; jobid?: string | number } | null;
    const kod = veri?.code !== undefined ? String(veri.code).padStart(2, "0") : null;
    if (yanit.ok && kod && BASARI_KODLARI.has(kod)) {
      return { durum: "gonderildi", saglayiciKimligi: veri?.jobid !== undefined ? String(veri.jobid) : undefined };
    }
    if (kod && HATA_ACIKLAMALARI[kod]) {
      const hata = `Netgsm ${kod}: ${HATA_ACIKLAMALARI[kod]}.`;
      return GECICI_KODLAR.has(kod) ? { durum: "gecici_hata", hata } : { durum: "kalici_hata", hata };
    }
    return {
      durum: "kalici_hata",
      hata: `Netgsm beklenmeyen yanıt (HTTP ${yanit.status}${kod ? `, kod ${kod}` : ""}); SMS gönderilmiş olabilir.`,
      belirsiz: true,
    };
  }

  return {
    ad: "netgsm",
    kanal: "sms",
    sandbox: false,
    /** Ticari ileti: İYS süzgeci alıcı türüne göre (bireysel 11, tacir/esnaf 12). */
    async gonder(ileti) {
      if (!ileti.aboneliktenCikmaBaglantisi) return { durum: "kalici_hata", hata: "Ret yolu zorunlu." };
      return gonder(ileti, ileti.aliciTuru === "bireysel" ? "11" : "12");
    },
    /** Test SMS'i gibi bilgilendirme amaçlı gönderim (iysfilter 0). */
    gonderBilgilendirme: (ileti) => gonder(ileti, "0"),
  };
}
