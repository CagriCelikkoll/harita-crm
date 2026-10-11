import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { baglamGetir } from "@/server/oturum";
import { KurulumFormu } from "./kurulum-formu";

export const metadata: Metadata = { title: "Çalışma alanı oluştur" };

export default async function KurulumSayfasi() {
  const b = await baglamGetir();
  if (b.durum === "oturum-yok") redirect("/giris");
  if (b.durum === "tamam") redirect("/panel");
  return (
    <div className="kart">
      <h1 className="text-lg font-semibold">Çalışma alanınızı oluşturun</h1>
      <p className="mt-1 mb-4 text-sm text-soluk">
        Kayıtlarınız ve taramalarınız bu çalışma alanında tutulur. Ekip arkadaşlarınızı daha sonra Ayarlar&apos;dan
        davet edebilirsiniz. Bir davet bağlantısı aldıysanız o bağlantıyı açın.
      </p>
      <KurulumFormu />
    </div>
  );
}
