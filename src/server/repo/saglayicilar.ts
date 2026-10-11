// Sağlayıcı kimlik bilgileri (saglayici_ayarlari). Değer yalnızca şifreli olarak yazılır ve okunur;
// şifre çözme servisler/saglayici.ts'tedir. Durum fonksiyonu şifreli veriyi DÖNDÜRMEZ.
import { and, eq } from "drizzle-orm";
import { KANALLAR, type Kanal } from "@/lib/mesajlasma";
import { db } from "../db";
import { saglayiciAyarlari } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type SaglayiciDurumu = { tanimli: boolean; saglayici: string | null; guncellemeTarihi: Date | null };

/** Arayüz ve API için: yalnızca "tanımlı / tanımlı değil" (kimlik bilgisi yok). */
export function saglayiciDurumlari(ctx: TenantContext): Record<Kanal, SaglayiciDurumu> {
  const satirlar = db
    .select({ kanal: saglayiciAyarlari.kanal, saglayici: saglayiciAyarlari.saglayici, guncellemeTarihi: saglayiciAyarlari.guncellemeTarihi })
    .from(saglayiciAyarlari)
    .where(eq(saglayiciAyarlari.tenantId, ctx.tenantId))
    .all();
  return Object.fromEntries(
    KANALLAR.map((k) => {
      const s = satirlar.find((x) => x.kanal === k);
      return [k, { tanimli: Boolean(s), saglayici: s?.saglayici ?? null, guncellemeTarihi: s?.guncellemeTarihi ?? null }];
    }),
  ) as Record<Kanal, SaglayiciDurumu>;
}

/** Yalnızca sunucu içi kullanım (gönderim): şifreli veri. API yanıtına KONMAZ. */
export function saglayiciSifreliGetir(ctx: TenantContext, kanal: Kanal) {
  return (
    db
      .select({ saglayici: saglayiciAyarlari.saglayici, sifreliVeri: saglayiciAyarlari.sifreliVeri })
      .from(saglayiciAyarlari)
      .where(and(eq(saglayiciAyarlari.tenantId, ctx.tenantId), eq(saglayiciAyarlari.kanal, kanal)))
      .get() ?? null
  );
}

/** Yalnızca yönetici. sifreliVeri, servisler/saglayici.ts'te kiracı|kanal AAD'siyle şifrelenmiş olmalı. */
export function saglayiciKaydet(ctx: TenantContext, kanal: Kanal, saglayici: string, sifreliVeri: string) {
  yoneticiOlmali(ctx);
  const degerler = { saglayici, sifreliVeri, guncelleyen: ctx.userId, guncellemeTarihi: new Date() };
  db.insert(saglayiciAyarlari)
    .values({ tenantId: ctx.tenantId, kanal, ...degerler })
    .onConflictDoUpdate({ target: [saglayiciAyarlari.tenantId, saglayiciAyarlari.kanal], set: degerler })
    .run();
}

/** Yalnızca yönetici. Silinince kanal sandbox'a döner. */
export function saglayiciSil(ctx: TenantContext, kanal: Kanal): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .delete(saglayiciAyarlari)
      .where(and(eq(saglayiciAyarlari.tenantId, ctx.tenantId), eq(saglayiciAyarlari.kanal, kanal)))
      .returning({ k: saglayiciAyarlari.kanal })
      .get(),
  );
}
