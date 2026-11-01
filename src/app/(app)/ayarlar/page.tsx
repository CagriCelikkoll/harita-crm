import { redirect } from "next/navigation";
import { ILK_AYAR_BOLUMU } from "@/lib/ayar-bolumleri";

export default function AyarlarSayfasi() {
  redirect(ILK_AYAR_BOLUMU);
}
