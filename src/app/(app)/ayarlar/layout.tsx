// Ayarlar (docs/tasarim/Main.dc.html): solda gruplanmış ayar menüsü, sağda tek bölüm (her bölüm ayrı rota).
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ayarGruplari } from "@/lib/ayar-bolumleri";
import { sayfaBaglami } from "@/server/oturum";
import { saglayiciDurumlari } from "@/server/repo/saglayicilar";
import { baglantiDurumu } from "@/server/servisler/whatsapp-api";
import { AyarMenusu } from "./ayar-menusu";

export default async function AyarlarDuzeni({ children }: LayoutProps<"/ayarlar">) {
  const { ctx } = await sayfaBaglami();
  const yonetici = ctx.rol === "yonetici";
  const saglayicilar = yonetici ? saglayiciDurumlari(ctx) : null;
  const wa = yonetici ? baglantiDurumu(ctx) : null;
  return (
    <>
      <SayfaBasligi baslik="Ayarlar" aciklama="Çalışma alanınızı, ekibinizi ve iletişim kanallarınızı buradan yönetin." />
      <div className="flex flex-col items-start gap-8 lg:flex-row lg:gap-12">
        <AyarMenusu
          gruplar={ayarGruplari(ctx.rol)}
          kanalBagli={{
            whatsapp: Boolean(wa?.tanimli && wa.numaraDogrulandi),
            sms: Boolean(saglayicilar?.sms.tanimli),
            eposta: Boolean(saglayicilar?.eposta.tanimli),
          }}
        />
        <section className="flex w-full max-w-[920px] min-w-0 flex-1 flex-col gap-6">{children}</section>
      </div>
    </>
  );
}
