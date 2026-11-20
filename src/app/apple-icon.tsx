// iPhone/iPad ana ekran simgesi (180 px; iOS köşeleri kendisi yuvarlatır, bu yüzden tam zemin).
import { ImageResponse } from "next/og";
import { SimgeCizimi } from "./simge-cizimi";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleSimge() {
  return new ImageResponse(<SimgeCizimi boyut={180} maske />, size);
}
