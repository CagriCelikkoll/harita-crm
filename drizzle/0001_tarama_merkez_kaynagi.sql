PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`olusturan` text,
	`merkez_kaynagi` text DEFAULT 'harita' NOT NULL,
	`merkez_lat` real,
	`merkez_lng` real,
	`adres_metni` text,
	`yaricap_m` integer NOT NULL,
	`kategori` text NOT NULL,
	`durum` text DEFAULT 'kuyrukta' NOT NULL,
	`bulunan_sayisi` integer DEFAULT 0 NOT NULL,
	`istek_sayisi` integer DEFAULT 0 NOT NULL,
	`kapsam_tamam` integer,
	`hata_mesaji` text,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`baslama_tarihi` integer,
	`tamamlanma_tarihi` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`olusturan`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_scans`("id", "tenant_id", "olusturan", "merkez_kaynagi", "merkez_lat", "merkez_lng", "yaricap_m", "kategori", "durum", "bulunan_sayisi", "istek_sayisi", "kapsam_tamam", "hata_mesaji", "olusturma_tarihi", "tamamlanma_tarihi") SELECT "id", "tenant_id", "olusturan", 'harita', "merkez_lat", "merkez_lng", "yaricap_m", "kategori", "durum", "bulunan_sayisi", "istek_sayisi", "kapsam_tamam", "hata_mesaji", "olusturma_tarihi", "tamamlanma_tarihi" FROM `scans`;--> statement-breakpoint
DROP TABLE `scans`;--> statement-breakpoint
ALTER TABLE `__new_scans` RENAME TO `scans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `scans_tenant_idx` ON `scans` (`tenant_id`,`olusturma_tarihi`);--> statement-breakpoint
CREATE INDEX `scans_durum_idx` ON `scans` (`durum`,`baslama_tarihi`);