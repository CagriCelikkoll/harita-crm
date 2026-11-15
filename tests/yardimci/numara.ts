// Tek WhatsApp numarası kurulmuş çalışma alanlarının testleri için: o numaranın kimliği.
import type { TenantContext } from "@/server/repo/baglam";
import { baglantilariListele } from "@/server/repo/whatsapp-baglantilari";

export function tekNumara(ctx: TenantContext): string {
  const liste = baglantilariListele(ctx);
  if (liste.length !== 1) throw new Error(`Bu çalışma alanında ${liste.length} numara var; tekNumara yalnızca tek numara içindir.`);
  return liste[0].id;
}
