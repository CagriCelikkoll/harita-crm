import { sayfaBaglami } from "@/server/oturum";
import { Menu } from "@/components/menu";

export default async function UygulamaLayout({ children }: LayoutProps<"/">) {
  const b = await sayfaBaglami();
  return (
    <div className="min-h-screen md:flex">
      <Menu
        kullaniciAdi={b.oturum.user.name}
        kullaniciEposta={b.oturum.user.email}
        aktifAlan={{ tenantId: b.aktif.tenantId, ad: b.aktif.ad }}
        alanlar={b.uyelikler.map((u) => ({ tenantId: u.tenantId, ad: u.ad }))}
      />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
