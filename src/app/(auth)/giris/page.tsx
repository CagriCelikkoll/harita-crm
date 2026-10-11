import type { Metadata } from "next";
import { Suspense } from "react";
import { GirisFormu } from "./giris-formu";

export const metadata: Metadata = { title: "Giriş" };

export default function GirisSayfasi() {
  return (
    <Suspense>
      <GirisFormu />
    </Suspense>
  );
}
