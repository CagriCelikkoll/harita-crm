-- Şablon / WABA veri temizliği (yalnızca silme; şema değişmez). Kampanyada kullanılmış şablona (kampanyalar.sablon_id)
-- dokunulmaz: kampanya geçmişi bozulmaz.
-- 1) Çalışma alanında o WABA'ya bağlı hiçbir numara yoksa (numara silinmiş, WABA değiştirilmiş ya da 0019 öncesinden
--    kalmış yanlış etiketli satır) şablon satırı silinir. Numara yeniden eklenince "Meta'dan yenile" doğru listeyi yazar.
DELETE FROM `whatsapp_sablonlari`
WHERE NOT EXISTS (
    SELECT 1 FROM `whatsapp_baglantilari` b
    WHERE b.`tenant_id` = `whatsapp_sablonlari`.`tenant_id` AND b.`waba_id` = `whatsapp_sablonlari`.`waba_id`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `kampanyalar` k
    WHERE k.`tenant_id` = `whatsapp_sablonlari`.`tenant_id` AND k.`sablon_id` = `whatsapp_sablonlari`.`id`
  );
--> statement-breakpoint
-- 2) Meta'da silinmiş (SILINDI) ve hiçbir kampanyada kullanılmamış şablonlar silinir.
DELETE FROM `whatsapp_sablonlari`
WHERE `durum` = 'SILINDI'
  AND NOT EXISTS (
    SELECT 1 FROM `kampanyalar` k
    WHERE k.`tenant_id` = `whatsapp_sablonlari`.`tenant_id` AND k.`sablon_id` = `whatsapp_sablonlari`.`id`
  );
-- Bir WABA'nın altında yanlış duran (Meta'da o WABA'da olmayan) diğer satırlar, o numaranın bir sonraki
-- "Meta'dan yenile"sinde silinir (repo/whatsapp-sablonlari.sablonlariSenkronla).
