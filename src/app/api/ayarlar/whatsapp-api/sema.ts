// Numara kaydı ve ayarlarının ortak doğrulama şeması (rotalar).
import { z } from "zod";

const kimlik = (ad: string) => z.string().trim().regex(/^\d{5,30}$/, `${ad} yalnızca rakamlardan oluşmalı.`);
const gizli = z.string().trim().max(1000).nullish();

export const BaglantiKimlikleri = z.object({
  wabaId: kimlik("WABA ID"),
  phoneNumberId: kimlik("Phone Number ID"),
  erisimAnahtari: gizli,
  appSecret: gizli,
});
