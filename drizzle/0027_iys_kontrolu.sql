CREATE TABLE `denetim_kayitlari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kullanici_id` text,
	`kullanici_adi` text,
	`olay` text NOT NULL,
	`deger` text,
	`aciklama` text,
	`tarih` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kullanici_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `denetim_kayitlari_tenant_idx` ON `denetim_kayitlari` (`tenant_id`,`olay`,`tarih`);--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `iys_kontrolu` integer DEFAULT true NOT NULL;