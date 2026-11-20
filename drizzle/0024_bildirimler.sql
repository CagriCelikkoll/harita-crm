CREATE TABLE `bildirim_kuyrugu` (
	`tenant_id` text NOT NULL,
	`sohbet_id` text NOT NULL,
	`profil_adi` text,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`tenant_id`, `sohbet_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`sohbet_id`) REFERENCES `sohbetler`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bildirim_kuyrugu_tarih_idx` ON `bildirim_kuyrugu` (`olusturma_tarihi`);--> statement-breakpoint
CREATE TABLE `push_abonelikleri` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`cihaz` text,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`son_kayit_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`son_basari_tarihi` integer,
	`ardisik_hata` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`tenant_id`) REFERENCES `memberships`(`user_id`,`tenant_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_abonelikleri_adres_uq` ON `push_abonelikleri` (`tenant_id`,`endpoint`);--> statement-breakpoint
CREATE INDEX `push_abonelikleri_kullanici_idx` ON `push_abonelikleri` (`tenant_id`,`user_id`);