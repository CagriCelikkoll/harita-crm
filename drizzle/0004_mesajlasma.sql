CREATE TABLE `engel_listesi` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`tur` text NOT NULL,
	`ozet` text NOT NULL,
	`kaynak` text NOT NULL,
	`lead_id` text,
	`tarih` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engel_listesi_uq` ON `engel_listesi` (`tenant_id`,`tur`,`ozet`);--> statement-breakpoint
CREATE TABLE `gonderim_sayaclari` (
	`tenant_id` text NOT NULL,
	`kanal` text NOT NULL,
	`kullanici_id` text DEFAULT '' NOT NULL,
	`donem` text NOT NULL,
	`adet` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`tenant_id`, `kanal`, `kullanici_id`, `donem`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ileti_ayarlari` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`gonderen_unvani` text,
	`iletisim_bilgisi` text,
	`iys_no` text,
	`sorumluluk_onay_tarihi` integer,
	`sorumluluk_onaylayan` text,
	`gonderim_baslangic_dk` integer DEFAULT 540 NOT NULL,
	`gonderim_bitis_dk` integer DEFAULT 1200 NOT NULL,
	`gunluk_eposta_siniri` integer,
	`gunluk_sms_siniri` integer,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sorumluluk_onaylayan`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `kampanyalar` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`olusturan` text,
	`kanal` text NOT NULL,
	`ad` text NOT NULL,
	`konu` text,
	`sablon` text NOT NULL,
	`bos_isim_hitabi` text,
	`filtre` text NOT NULL,
	`sandbox` integer NOT NULL,
	`durum` text NOT NULL,
	`planlanan_tarih` integer,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`baslama_tarihi` integer,
	`tamamlanma_tarihi` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`olusturan`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kampanyalar_tenant_id_uq` ON `kampanyalar` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `kampanyalar_tenant_idx` ON `kampanyalar` (`tenant_id`,`olusturma_tarihi`);--> statement-breakpoint
CREATE INDEX `kampanyalar_durum_idx` ON `kampanyalar` (`durum`,`planlanan_tarih`);--> statement-breakpoint
CREATE TABLE `message_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kampanya_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`kanal` text NOT NULL,
	`durum` text NOT NULL,
	`neden` text,
	`hata` text,
	`deneme_sayisi` integer DEFAULT 0 NOT NULL,
	`sonraki_deneme` integer,
	`kilit_zamani` integer,
	`sayac_gunu` text,
	`saglayici_kimligi` text,
	`sandbox_icerik` text,
	`gonderim_tarihi` integer,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`kampanya_id`) REFERENCES `kampanyalar`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`lead_id`) REFERENCES `leads`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_queue_kampanya_lead_uq` ON `message_queue` (`kampanya_id`,`lead_id`);--> statement-breakpoint
CREATE INDEX `message_queue_bekleyen_idx` ON `message_queue` (`durum`,`sonraki_deneme`);--> statement-breakpoint
CREATE INDEX `message_queue_kampanya_idx` ON `message_queue` (`tenant_id`,`kampanya_id`,`durum`);--> statement-breakpoint
CREATE TABLE `saglayici_ayarlari` (
	`tenant_id` text NOT NULL,
	`kanal` text NOT NULL,
	`saglayici` text NOT NULL,
	`sifreli_veri` text NOT NULL,
	`guncelleyen` text,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`tenant_id`, `kanal`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guncelleyen`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `isletme_adi` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `alici_turu` text DEFAULT 'tacir_esnaf' NOT NULL;