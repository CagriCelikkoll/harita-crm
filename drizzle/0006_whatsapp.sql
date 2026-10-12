CREATE TABLE `whatsapp_listesi` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kullanici_id` text NOT NULL,
	`gun` text NOT NULL,
	`lead_id` text NOT NULL,
	`sira` integer NOT NULL,
	`durum` text DEFAULT 'bekliyor' NOT NULL,
	`neden` text,
	`adres_ozeti` text,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kullanici_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`lead_id`) REFERENCES `leads`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_listesi_uq` ON `whatsapp_listesi` (`tenant_id`,`gun`,`lead_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_listesi_kullanici_idx` ON `whatsapp_listesi` (`tenant_id`,`kullanici_id`,`gun`,`sira`);--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `whatsapp_sablonu` text;--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `whatsapp_gunluk_sinir` integer;