import { sayfaBaglami } from "@/server/oturum";
import { BildirimAlani } from "@/components/bildirim";
import { Menu } from "@/components/menu";
import { kullanimOzeti } from "@/lib/arayuz";
import { ROL_ADLARI } from "@/lib/sabitler";
import { kotaDurumu } from "@/server/repo/kullanim";

// Sayfa iskeleti (docs/tasarim/): solda 232 px menü, sağda tam genişlik içerik (iç boşluk 40 / 48 / 72 px).
export default async function UygulamaLayout({ children }: LayoutProps<"/">) {
  const b = await sayfaBaglami();
  return (
    <div className="min-h-screen md:flex">
      <Menu
        kullaniciAdi={b.oturum.user.name}
        kullaniciEposta={b.oturum.user.email}
        rolAdi={ROL_ADLARI[b.aktif.rol]}
        aktifAlan={{ tenantId: b.aktif.tenantId, ad: b.aktif.ad }}
        alanlar={b.uyelikler.map((u) => ({ tenantId: u.tenantId, ad: u.ad }))}
        kullanim={kullanimOzeti(kotaDurumu(b.ctx))}
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-12 md:pt-10 md:pb-18">{children}</main>
      <BildirimAlani />
    </div>
  );
}
