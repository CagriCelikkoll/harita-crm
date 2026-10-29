CREATE TABLE `ice_aktarmalar` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kullanici_id` text,
	`dosya_adi` text NOT NULL,
	`durum` text DEFAULT 'hazirlaniyor' NOT NULL,
	`satirlar` text,
	`eslem` text,
	`toplam` integer DEFAULT 0 NOT NULL,
	`eklenen` integer DEFAULT 0 NOT NULL,
	`guncellenen` integer DEFAULT 0 NOT NULL,
	`hatali` integer DEFAULT 0 NOT NULL,
	`cakisan` integer DEFAULT 0 NOT NULL,
	`engelli` integer DEFAULT 0 NOT NULL,
	`beyan_onay_tarihi` integer,
	`beyan_surumu` text,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`tamamlanma_tarihi` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kullanici_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ice_aktarmalar_tenant_id_uq` ON `ice_aktarmalar` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `ice_aktarmalar_tenant_idx` ON `ice_aktarmalar` (`tenant_id`,`olusturma_tarihi`);--> statement-breakpoint
CREATE TABLE `whatsapp_kisileri` (
	`tenant_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`bsuid` text,
	`wa_kullanici_adi` text,
	`izin` text DEFAULT 'yok' NOT NULL,
	`izin_tarihi` integer,
	`izin_kaynagi` text,
	`izin_notu` text,
	`izin_ice_aktarma_id` text,
	`iys_beyan_tarihi` integer,
	`whatsapp_yok_tarihi` integer,
	`reklam_kimligi` text,
	`reklam_basligi` text,
	`ctwa_clid` text,
	`pencere_bitis` integer,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`tenant_id`, `lead_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`lead_id`) REFERENCES `leads`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_kisileri_bsuid_uq` ON `whatsapp_kisileri` (`tenant_id`,`bsuid`) WHERE "whatsapp_kisileri"."bsuid" is not null;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kaynak` text DEFAULT 'google' NOT NULL,
	`place_id` text,
	`scan_id` text,
	`durum` text DEFAULT 'yeni' NOT NULL,
	`yetkili_adi` text,
	`eposta` text,
	`ek_telefon` text,
	`telefon_e164` text,
	`notlar` text,
	`etiketler` text DEFAULT '[]' NOT NULL,
	`ileti_izni` text DEFAULT 'bekliyor' NOT NULL,
	`isletme_adi` text,
	`alici_turu` text DEFAULT 'tacir_esnaf' NOT NULL,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "leads_kaynak_place_ck" CHECK(("__new_leads"."kaynak" = 'google') = ("__new_leads"."place_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_leads`("id", "tenant_id", "kaynak", "place_id", "scan_id", "durum", "yetkili_adi", "eposta", "ek_telefon", "notlar", "etiketler", "ileti_izni", "isletme_adi", "alici_turu", "olusturma_tarihi", "guncelleme_tarihi") SELECT "id", "tenant_id", 'google', "place_id", "scan_id", "durum", "yetkili_adi", "eposta", "ek_telefon", "notlar", "etiketler", "ileti_izni", "isletme_adi", "alici_turu", "olusturma_tarihi", "guncelleme_tarihi" FROM `leads`;--> statement-breakpoint
DROP TABLE `leads`;--> statement-breakpoint
ALTER TABLE `__new_leads` RENAME TO `leads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `leads_tenant_place_uq` ON `leads` (`tenant_id`,`place_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_tenant_id_uq` ON `leads` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `leads_tenant_guncelleme_idx` ON `leads` (`tenant_id`,`guncelleme_tarihi`);--> statement-breakpoint
CREATE INDEX `leads_tenant_telefon_idx` ON `leads` (`tenant_id`,`telefon_e164`);