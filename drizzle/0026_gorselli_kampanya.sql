PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sohbet_medyalari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`mesaj_id` text,
	`meta_medya_id` text,
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
INSERT INTO `__new_sohbet_medyalari`("id", "tenant_id", "mesaj_id", "meta_medya_id", "mime", "boyut", "sha256", "meta_sha256", "dosya_adi", "yol", "durum", "neden", "deneme", "sonraki_deneme", "indirme_tarihi", "silinme_tarihi", "olusturma_tarihi") SELECT "id", "tenant_id", "mesaj_id", "meta_medya_id", "mime", "boyut", "sha256", "meta_sha256", "dosya_adi", "yol", "durum", "neden", "deneme", "sonraki_deneme", "indirme_tarihi", "silinme_tarihi", "olusturma_tarihi" FROM `sohbet_medyalari`;--> statement-breakpoint
DROP TABLE `sohbet_medyalari`;--> statement-breakpoint
ALTER TABLE `__new_sohbet_medyalari` RENAME TO `sohbet_medyalari`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sohbet_medyalari_mesaj_uq` ON `sohbet_medyalari` (`tenant_id`,`mesaj_id`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_bekleyen_idx` ON `sohbet_medyalari` (`durum`,`sonraki_deneme`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_kota_idx` ON `sohbet_medyalari` (`tenant_id`,`durum`);--> statement-breakpoint
CREATE INDEX `sohbet_medyalari_yol_idx` ON `sohbet_medyalari` (`yol`);--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `gorsel_medya_id` text;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `meta_gorsel_id` text;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `meta_gorsel_numarasi` text;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `meta_gorsel_tarihi` integer;--> statement-breakpoint
ALTER TABLE `whatsapp_sablonlari` ADD `baslik_bicimi` text;--> statement-breakpoint
UPDATE `whatsapp_sablonlari` SET `baslik_bicimi` = (SELECT upper(coalesce(json_extract(b.value, '$.format'), 'TEXT')) FROM json_each(`whatsapp_sablonlari`.`bilesenler`) b WHERE upper(json_extract(b.value, '$.type')) = 'HEADER' LIMIT 1);
