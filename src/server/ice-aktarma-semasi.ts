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
        varsayilanAliciTuru: z.enum(ALICI_TURLERI),
        varsayilanIzinKaynagi: z.enum(WHATSAPP_IZIN_KAYNAKLARI).nullable(),
        iysBeyani: z.boolean(),
      })
      .strict(),
  })
  .strict();
