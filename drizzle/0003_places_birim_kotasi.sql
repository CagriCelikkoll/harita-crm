-- Kota birimi istek -> birim (Essentials tabanı). Mevcut kotalar ve bu ayın sayaçları 3 ile çarpılır:
-- liste satırı (Place Details Pro) 3 birimdir; böylece kullanım oranı korunur (2.000 istek -> 6.000 birim).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`ad` text NOT NULL,
	`slug` text NOT NULL,
	`veri_saklama_gun` integer,
	`aylik_places_kotasi` integer DEFAULT 6000 NOT NULL,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tenants`("id", "ad", "slug", "veri_saklama_gun", "aylik_places_kotasi", "olusturma_tarihi") SELECT "id", "ad", "slug", "veri_saklama_gun", "aylik_places_kotasi" * 3, "olusturma_tarihi" FROM `tenants`;--> statement-breakpoint
DROP TABLE `tenants`;--> statement-breakpoint
ALTER TABLE `__new_tenants` RENAME TO `tenants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
UPDATE `usage_counters` SET `places_istek_sayisi` = `places_istek_sayisi` * 3;