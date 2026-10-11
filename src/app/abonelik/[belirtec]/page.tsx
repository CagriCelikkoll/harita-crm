// Herkese açık abonelikten çıkma sayfası. Oturum gerekmez; gönderen unvanı dışında bilgi gösterilmez.
import type { Metadata } from "next";
import { abonelikSayfaBilgisi } from "@/server/servisler/abonelik";
import { CikisButonu } from "./cikis-butonu";

export const metadata: Metadata = { title: "Abonelikten çık", robots: { index: false, follow: false } };

export default async function AbonelikSayfasi({ params }: PageProps<"/abonelik/[belirtec]">) {
  const { belirtec } = await params;
  const bilgi = abonelikSayfaBilgisi(belirtec);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="kart w-full max-w-md">
        {bilgi ? (
          <>
            <h1 className="baslik">Abonelikten çık</h1>
            <p className="mt-2 text-sm text-soluk">
              {bilgi.gonderenUnvani ? (
                <>
                  <strong className="text-metin">{bilgi.gonderenUnvani}</strong> tarafından gönderilen ticari
                  iletileri artık almak istemiyorsanız aşağıdaki butona basın.
                </>
              ) : (
                "Bu göndericiden ticari ileti almak istemiyorsanız aşağıdaki butona basın."
              )}
            </p>
            <CikisButonu belirtec={belirtec} />
          </>
        ) : (
          <>
            <h1 className="baslik">Bağlantı geçersiz</h1>
            <p className="mt-2 text-sm text-soluk">
              Bu abonelikten çıkma bağlantısı geçersiz veya eksik kopyalanmış. Bağlantıyı iletideki haliyle açmayı
              deneyin.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
