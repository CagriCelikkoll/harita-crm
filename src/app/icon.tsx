// Uygulama simgeleri (PWA, bildirim): menüdeki konum işareti, ana yeşil zeminde. Görsel dosya yok; next/og ile üretilir.
// "192" ve "512": köşeleri yuvarlatılmış; "maskable": tam zemin, işaret güvenli alanın içinde (Android kırpar).
import { ImageResponse } from "next/og";
import { SimgeCizimi } from "./simge-cizimi";

export const contentType = "image/png";

const SIMGELER = {
  "192": { boyut: 192, maske: false },
  "512": { boyut: 512, maske: false },
  maskable: { boyut: 512, maske: true },
} as const;

export function generateImageMetadata() {
  return Object.entries(SIMGELER).map(([id, s]) => ({ id, size: { width: s.boyut, height: s.boyut }, contentType }));
}

export default async function Simge({ id }: { id: Promise<string | number> }) {
  const s = SIMGELER[String(await id) as keyof typeof SIMGELER] ?? SIMGELER["192"];
  return new ImageResponse(<SimgeCizimi boyut={s.boyut} maske={s.maske} />, { width: s.boyut, height: s.boyut });
}
