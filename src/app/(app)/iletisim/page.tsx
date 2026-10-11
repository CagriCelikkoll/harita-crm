import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";

export const metadata: Metadata = { title: "İletişim" };

export default function IletisimSayfasi() {
  return (
    <>
      <SayfaBasligi baslik="İletişim" />
      <section className="kart max-w-xl">
        <p className="rozet mb-2">Yakında</p>
        <h2 className="font-semibold">Toplu SMS ve e-posta gönderimi</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-soluk">
          <li>İleti reddi işaretli kayıtlar her zaman gönderimden hariç tutulacak.</li>
          <li>Her iletiye ret seçeneği eklenecek; e-postalarda tek tıkla abonelikten çıkma sayfası olacak.</li>
          <li>İlk sürüm &quot;sandbox&quot; sağlayıcıyla çalışacak: gerçek gönderim yapmadan kaydeder.</li>
        </ul>
      </section>
    </>
  );
}
