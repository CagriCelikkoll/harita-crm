import type { Metadata } from "next";
import { AyarBolumu, Kart } from "@/components/arayuz/kart";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { basHarfler } from "@/lib/arayuz";
import { tarihYaz } from "@/lib/bicim";
import { ROL_ADLARI } from "@/lib/sabitler";
import { davetleriListele, uyeleriListele } from "@/server/repo/calisma-alani";
import { ayarBolumuBaglami } from "../erisim";
import { davetiIptalEt } from "../eylemler";
import { DavetFormu, KopyalaDugmesi, UyeCikarFormu } from "../formlar";

export const metadata: Metadata = { title: "Ekip ve roller · Ayarlar" };

const ROL_ACIKLAMALARI = {
  yonetici: "Ayarlar, kanallar, ekip ve WhatsApp (Meta) kampanyaları.",
  uye: "Tarama, kayıtlar, e-posta ve SMS kampanyaları, WhatsApp günlük liste.",
} as const;

export default async function EkipSayfasi() {
  const { ctx } = await ayarBolumuBaglami("ekip");
  const yonetici = ctx.rol === "yonetici";
  const uyeler = uyeleriListele(ctx);
  const davetler = yonetici ? davetleriListele(ctx) : [];
  const taban = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return (
    <AyarBolumu baslik="Ekip ve roller" aciklama="Çalışma alanınıza erişebilen kişiler.">
      <Kart etiket="Üyeler">
        <ul>
          {uyeler.map((u) => (
            <li key={u.userId} className="flex flex-wrap items-center gap-4 border-cizgi px-7 py-[18px] [&:not(:first-child)]:border-t">
              <span
                aria-hidden="true"
                className={`flex size-10 shrink-0 items-center justify-center rounded-full font-semibold ${
                  u.rol === "yonetici" ? "bg-ana-acik text-ana-koyu" : "bg-[#eef0ec] text-metin-ikincil"
                }`}
              >
                {basHarfler(u.ad)}
              </span>
              <div className="min-w-0 flex-[1_1_200px]">
                <p className="truncate font-semibold">
                  {u.ad} {u.userId === ctx.userId && <span className="font-normal text-soluk">(siz)</span>}
                </p>
                <p className="truncate text-[13px] text-soluk">{u.eposta}</p>
              </div>
              <DurumRozeti ton={u.rol === "yonetici" ? "ana" : "notr"}>{ROL_ADLARI[u.rol]}</DurumRozeti>
              {yonetici && u.userId !== ctx.userId && <UyeCikarFormu userId={u.userId} ad={u.ad} />}
            </li>
          ))}
          {davetler.map((d) => {
            const baglanti = `${taban}/davet/${d.token}`;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-4 border-t border-cizgi px-7 py-[18px]">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-pasif font-semibold text-soluk"
                >
                  ?
                </span>
                <div className="min-w-0 flex-[1_1_200px]">
                  <p className="truncate font-semibold">{d.eposta}</p>
                  <p className="text-[13px] text-soluk">
                    Davet gönderildi · {ROL_ADLARI[d.rol]} · son geçerlilik {tarihYaz(d.sonGecerlilik)}
                  </p>
                </div>
                <KopyalaDugmesi metin={baglanti} etiket="Bağlantıyı kopyala" />
                <form action={davetiIptalEt}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="dugme dugme-kucuk text-tehlike">
                    İptal et
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </Kart>

      {yonetici ? (
        <Kart>
          <DavetFormu />
        </Kart>
      ) : (
        <p className="text-[13px] text-soluk">Kişi davet etmek için yönetici yetkisi gerekir.</p>
      )}

      <div className="flex flex-wrap gap-4">
        {(["yonetici", "uye"] as const).map((r) => (
          <div key={r} className="min-w-0 flex-[1_1_260px] rounded-kart border border-kenar bg-white px-6 py-5">
            <KartBaslikSade baslik={ROL_ADLARI[r]} aciklama={ROL_ACIKLAMALARI[r]} />
          </div>
        ))}
      </div>
    </AyarBolumu>
  );
}

function KartBaslikSade(props: { baslik: string; aciklama: string }) {
  return (
    <>
      <p className="mb-1.5 font-semibold">{props.baslik}</p>
      <p className="text-[13px] text-soluk">{props.aciklama}</p>
    </>
  );
}

