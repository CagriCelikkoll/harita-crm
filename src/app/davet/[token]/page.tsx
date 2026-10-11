import type { Metadata } from "next";
import Link from "next/link";
import { ROL_ADLARI } from "@/lib/sabitler";
import { oturumGetir } from "@/server/oturum";
import { davetBilgisi } from "@/server/repo/sistem/uyelik";
import { DavetKabulFormu } from "./davet-kabul-formu";

export const metadata: Metadata = { title: "Davet" };

export default async function DavetSayfasi({ params }: PageProps<"/davet/[token]">) {
  const { token } = await params;
  const davet = davetBilgisi(token);
  const oturum = await oturumGetir();
  const gecerli = davet && !davet.kabulTarihi && davet.sonGecerlilik > new Date();
  const geriDonus = encodeURIComponent(`/davet/${token}`);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="kart w-full max-w-sm">
        <p className="mb-4 text-xl font-semibold text-ana">Harita CRM</p>
        {!gecerli ? (
          <p className="text-sm">Bu davet geçersiz, kullanılmış veya süresi dolmuş. Yöneticinizden yeni davet isteyin.</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold">{davet.tenantAd}</h1>
            <p className="mt-1 mb-4 text-sm text-soluk">
              <strong>{davet.eposta}</strong> adresi bu çalışma alanına <strong>{ROL_ADLARI[davet.rol]}</strong> olarak
              davet edildi.
            </p>
            {oturum ? (
              <>
                <p className="mb-3 text-sm">
                  Giriş yapılan hesap: <strong>{oturum.user.email}</strong>
                </p>
                <DavetKabulFormu token={token} />
              </>
            ) : (
              <p className="text-sm">
                Daveti kabul etmek için{" "}
                <Link className="font-medium text-ana underline" href={`/giris?sonra=${geriDonus}`}>
                  giriş yapın veya {davet.eposta} ile kayıt olun
                </Link>
                .
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
