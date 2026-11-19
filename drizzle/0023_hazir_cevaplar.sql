CREATE TABLE `hazir_cevaplar` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`baslik` text NOT NULL,
	`baslik_anahtari` text NOT NULL,
	`metin` text NOT NULL,
	`olusturan` text,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`olusturan`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hazir_cevaplar_baslik_uq` ON `hazir_cevaplar` (`tenant_id`,`baslik_anahtari`);