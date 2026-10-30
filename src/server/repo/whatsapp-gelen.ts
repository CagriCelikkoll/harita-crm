// İşlenmiş gelen WhatsApp iletilerinin kimlikleri (webhook tekrarlarını elemek için). İçerik saklanmaz.
import { db } from "../db";
import { whatsappGelenKimlikleri } from "../db/schema";
import type { TenantContext } from "./baglam";

/** İleti ilk kez görülüyorsa kaydeder ve true döner; daha önce işlendiyse false. */
export function gelenIletiKaydet(ctx: TenantContext, wamid: string, simdi = new Date()): boolean {
  return (
    db
      .insert(whatsappGelenKimlikleri)
      .values({ tenantId: ctx.tenantId, wamid, tarih: simdi })
      .onConflictDoNothing()
      .returning({ wamid: whatsappGelenKimlikleri.wamid })
      .all().length > 0
  );
}
