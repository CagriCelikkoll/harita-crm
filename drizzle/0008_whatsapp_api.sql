CREATE TABLE `whatsapp_baglantilari` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`webhook_kimligi` text NOT NULL,
	`waba_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`sifreli_veri` text NOT NULL,
	`test_modu` integer DEFAULT true NOT NULL,
	`uygulama_payi` integer DEFAULT 10 NOT NULL,
	`webhook_dogrulama_tarihi` integer,
	`son_imzali_durum_tarihi` integer,
	`gorunen_numara` text,
	`dogrulanmis_ad` text,
	`kalite` text,
	`limit_katmani` text,
	`son_kontrol` integer,
	`son_hata` text,
	`sablon_senkron_tarihi` integer,
	`guncelleyen` text,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guncelleyen`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_webhook_uq` ON `whatsapp_baglantilari` (`webhook_kimligi`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_numara_uq` ON `whatsapp_baglantilari` (`phone_number_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_sablonlari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`meta_id` text NOT NULL,
	`ad` text NOT NULL,
	`dil` text NOT NULL,
	`kategori` text NOT NULL,
	`durum` text NOT NULL,
	`parametre_bicimi` text,
	`bilesenler` text NOT NULL,
	`degiskenler` text NOT NULL,
	`abonelik_butonu` integer NOT NULL,
	`destek_nedeni` text,
	`kalite` text,
	`senkron_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_sablonlari_uq` ON `whatsapp_sablonlari` (`tenant_id`,`ad`,`dil`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_sablonlari_tenant_id_uq` ON `whatsapp_sablonlari` (`tenant_id`,`id`);