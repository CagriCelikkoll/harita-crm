-- Birim = 0,001 $ (önceki birim: Place Details Essentials = 5 $/1000 = 0,005 $). Kotalar 5 ile çarpılır (dolar karşılığı
-- korunur: 6.000 → 30.000 = 30 $). Sayaçlar kalem kalem gerçek fiyata çevrilir; her kalem tek bir SKU'dur:
--   tarama (Text Search Pro, eski 6 → 32), işletme bilgisi (Place Details Pro, eski 3 → 17),
--   iletişim bilgisi (Place Details Enterprise, eski 4 → 20). Kalemsiz eski birimler (0015 öncesi) 5 ile çarpılır.
-- Yeni kalem: harita_birim (Dynamic Maps, 7 $/1000 → 7 birim).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`ad` text NOT NULL,
	`slug` text NOT NULL,
	`veri_saklama_gun` integer,
	`aylik_places_kotasi` integer DEFAULT 30000 NOT NULL,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tenants`("id", "ad", "slug", "veri_saklama_gun", "aylik_places_kotasi", "olusturma_tarihi") SELECT "id", "ad", "slug", "veri_saklama_gun", "aylik_places_kotasi" * 5, "olusturma_tarihi" FROM `tenants`;--> statement-breakpoint
DROP TABLE `tenants`;--> statement-breakpoint
ALTER TABLE `__new_tenants` RENAME TO `tenants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
ALTER TABLE `usage_counters` ADD `harita_birim` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `usage_counters` SET
	`places_istek_sayisi` = cast(round(`tarama_birim` * 32.0 / 6) as integer) + cast(round(`isletme_bilgisi_birim` * 17.0 / 3) as integer)
		+ `iletisim_bilgisi_birim` * 5
		+ max(0, `places_istek_sayisi` - `tarama_birim` - `isletme_bilgisi_birim` - `iletisim_bilgisi_birim`) * 5,
	`tarama_birim` = cast(round(`tarama_birim` * 32.0 / 6) as integer),
	`isletme_bilgisi_birim` = cast(round(`isletme_bilgisi_birim` * 17.0 / 3) as integer),
	`iletisim_bilgisi_birim` = `iletisim_bilgisi_birim` * 5;