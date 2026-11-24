// İçe aktarma API'lerinin ortak istek şeması.
import "server-only";
import { z } from "zod";
import { ICE_AKTARMA_ALANLARI } from "@/lib/ice-aktarma";
import { ALICI_TURLERI, WHATSAPP_IZIN_KAYNAKLARI } from "@/lib/mesajlasma";

export const EslemVeSecenekler = z
  .object({
    eslem: z.partialRecord(z.enum(ICE_AKTARMA_ALANLARI), z.number().int().min(0).max(49)),
    secenekler: z
      .object({
        cakisma: z.enum(["atla", "bos_doldur"]),
        // Varsayılan yok: alıcı türü sütunu eşlenmemişse kullanıcı tüm dosya için seçer (null ise önizleme reddedilir).
        varsayilanAliciTuru: z.enum(ALICI_TURLERI).nullable(),
        // "Diğer" açıklama ister: içe aktarmada seçilemez (toplu işlemde ve kayıt panelinde notla).
        varsayilanIzinKaynagi: z.enum(WHATSAPP_IZIN_KAYNAKLARI).exclude(["diger"]).nullable(),
        iysBeyani: z.boolean(),
        // WhatsApp izni sütunu eşlenmemişse tüm dosya için (Google biçimi toplu seçim).
        varsayilanIzin: z.enum(["yok", "var"]).default("yok"),
        // Dosyadaki etiket → yeni ad (null / boş: yok say).
        etiketEslemi: z
          .record(z.string().max(100), z.string().trim().max(40).nullable())
          .refine((r) => Object.keys(r).length <= 500, "En fazla 500 etiket eşlenebilir.")
          .optional(),
      })
      .strict(),
  })
  .strict();
