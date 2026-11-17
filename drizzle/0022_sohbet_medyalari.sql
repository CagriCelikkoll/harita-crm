CREATE TABLE `sohbet_medyalari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`mesaj_id` text NOT NULL,
	`meta_medya_id` text NOT NULL,
	`mime` text,
	`boyut` integer,
	`sha256` text,
	`meta_sha256` text,
	`dosya_adi` text,
	`yol` text,
	`durum` text DEFAULT 'bekliyor' NOT NULL,
	`neden` text,
	`deneme` integer DEFAULT 0 NOT NULL,
	`sonraki_deneme` integer,
	`indirme_tarihi` integer,
	`silinme_tarihi` integer,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`mesaj_id`) REFERENCES `sohbet_mesajlari`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sohbet_medyalari_mesaj_uq` ON `sohbet_medyalari` (`tenant_id`,`mesaj_id`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_bekleyen_idx` ON `sohbet_medyalari` (`durum`,`sonraki_deneme`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_kota_idx` ON `sohbet_medyalari` (`tenant_id`,`durum`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_yol_idx` ON `sohbet_medyalari` (`yol`);--> statement-breakpoint
CREATE UNIQUE INDEX `sohbet_mesajlari_tenant_id_uq` ON `sohbet_mesajlari` (`tenant_id`,`id`);