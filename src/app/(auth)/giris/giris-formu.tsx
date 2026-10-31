"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authIstemci } from "@/lib/auth-istemci";
import { guvenliYol } from "@/lib/yol";

type Mod = "giris" | "kayit";

// Sayfa yüklenip React devreye girmeden (hidrasyon) önce form gönderilirse tarayıcı formu kendisi gönderir: alanlar
// uyarısız boşalır ve (method verilmezse) e-posta ile şifre adres çubuğuna yazılırdı. Bu yüzden düğme hidrasyona kadar
// pasiftir ve form method="post" taşır (şifre hiçbir koşulda URL'e düşmez).
const bosAbone = () => () => {};
const useHazir = () => useSyncExternalStore(bosAbone, () => true, () => false);

export function GirisFormu() {
  const router = useRouter();
  const sonra = guvenliYol(useSearchParams().get("sonra"));
  const [mod, setMod] = useState<Mod>("giris");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const hazir = useHazir();

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    const veri = new FormData(olay.currentTarget);
    const eposta = String(veri.get("eposta"));
    const sifre = String(veri.get("sifre"));
    setHata(null);
    setBekliyor(true);
    const { error } =
      mod === "giris"
        ? await authIstemci.signIn.email({ email: eposta, password: sifre })
        : await authIstemci.signUp.email({ email: eposta, password: sifre, name: String(veri.get("ad")) });
    setBekliyor(false);
    if (error) {
      setHata(hataMetni(error.code, error.message));
      return;
    }
    router.replace(sonra);
    router.refresh();
  }

  return (
    <div className="kart">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-zemin p-1" role="tablist">
        {(["giris", "kayit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mod === m}
            onClick={() => {
              setMod(m);
              setHata(null);
            }}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mod === m ? "bg-white text-ana shadow-sm" : "text-soluk"}`}
          >
            {m === "giris" ? "Giriş yap" : "Kayıt ol"}
          </button>
        ))}
      </div>

      <form method="post" onSubmit={gonder} className="flex flex-col gap-3">
        {mod === "kayit" && (
          <label className="etiket">
            Ad soyad
            <input name="ad" required minLength={2} autoComplete="name" className="girdi" />
          </label>
        )}
        <label className="etiket">
          E-posta
          <input name="eposta" type="email" required autoComplete="email" className="girdi" />
        </label>
        <label className="etiket">
          Şifre
          <input
            name="sifre"
            type="password"
            required
            minLength={10}
            autoComplete={mod === "giris" ? "current-password" : "new-password"}
            className="girdi"
          />
          {mod === "kayit" && <span className="text-xs font-normal text-soluk">En az 10 karakter.</span>}
        </label>
        {hata && (
          <p role="alert" className="text-sm text-tehlike">
            {hata}
          </p>
        )}
        <button type="submit" className="dugme-ana mt-1" disabled={bekliyor || !hazir}>
          {!hazir ? "Yükleniyor…" : bekliyor ? "Lütfen bekleyin…" : mod === "giris" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>
    </div>
  );
}

function hataMetni(kod: string | undefined, mesaj: string | undefined) {
  switch (kod) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-posta veya şifre hatalı.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Bu e-posta ile kayıtlı bir hesap var.";
    case "PASSWORD_TOO_SHORT":
      return "Şifre en az 10 karakter olmalı.";
    default:
      return mesaj ?? "İşlem başarısız oldu.";
  }
}
