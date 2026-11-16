-- 0020 Gelen kutusu: sohbetler (kişi x numara), sohbet mesajları, iç notlar, canlı yenileme sayacı;
-- ileti_ayarlari: mesaj ve medya saklama süresi (365 / 90 gün), okundu bildirimi. Mevcut veriye dokunmaz.
CREATE TABLE `gelen_kutusu_surumu` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`surum` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sohbet_mesajlari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`sohbet_id` text NOT NULL,
	`yon` text NOT NULL,
	`kaynak` text NOT NULL,
	`wamid` text,
	`istemci_kimligi` text,
	`tur` text NOT NULL,
	`metin` text,
	`medya_id` text,
	`icerik_silindi` integer DEFAULT false NOT NULL,
	`gonderen_kullanici` text,
	`kampanya_id` text,
	`teslim_durumu` text,
	`teslim_hata_kodu` integer,
	`meta_zamani` integer,
	`tarih` integer NOT NULL,
	`surum` integer DEFAULT 0 NOT NULL,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gonderen_kullanici`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tenant_id`,`sohbet_id`) REFERENCES `sohbetler`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sohbet_mesajlari_wamid_uq` ON `sohbet_mesajlari` (`tenant_id`,`wamid`) WHERE "sohbet_mesajlari"."wamid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `sohbet_mesajlari_istemci_uq` ON `sohbet_mesajlari` (`tenant_id`,`istemci_kimligi`) WHERE "sohbet_mesajlari"."istemci_kimligi" is not null;--> statement-breakpoint
CREATE INDEX `sohbet_mesajlari_sohbet_idx` ON `sohbet_mesajlari` (`tenant_id`,`sohbet_id`,`tarih`);--> statement-breakpoint
CREATE INDEX `sohbet_mesajlari_surum_idx` ON `sohbet_mesajlari` (`tenant_id`,`surum`);--> statement-breakpoint
CREATE INDEX `sohbet_mesajlari_tarih_idx` ON `sohbet_mesajlari` (`tarih`);--> statement-breakpoint
CREATE TABLE `sohbet_notlari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`sohbet_id` text NOT NULL,
	`kullanici_id` text,
	`metin` text NOT NULL,
	`tarih` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kullanici_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tenant_id`,`sohbet_id`) REFERENCES `sohbetler`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sohbet_notlari_sohbet_idx` ON `sohbet_notlari` (`tenant_id`,`sohbet_id`,`tarih`);--> statement-breakpoint
CREATE TABLE `sohbetler` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`baglanti_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`durum` text DEFAULT 'acik' NOT NULL,
	`atanan_kullanici` text,
	`son_mesaj_tarihi` integer,
	`son_gelen_tarihi` integer,
	`okunmamis` integer DEFAULT 0 NOT NULL,
	`bot_sus_bitis` integer,
	`surum` integer DEFAULT 0 NOT NULL,
	`olusturma_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`atanan_kullanici`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tenant_id`,`lead_id`) REFERENCES `leads`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sohbetler_tenant_id_uq` ON `sohbetler` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sohbetler_kisi_numara_uq` ON `sohbetler` (`tenant_id`,`baglanti_id`,`lead_id`);--> statement-breakpoint
CREATE INDEX `sohbetler_numara_son_idx` ON `sohbetler` (`tenant_id`,`baglanti_id`,`son_mesaj_tarihi`);--> statement-breakpoint
CREATE INDEX `sohbetler_son_idx` ON `sohbetler` (`tenant_id`,`son_mesaj_tarihi`);--> statement-breakpoint
CREATE INDEX `sohbetler_surum_idx` ON `sohbetler` (`tenant_id`,`surum`);--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `mesaj_saklama_gun` integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `medya_saklama_gun` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `okundu_bildirimi` integer DEFAULT true NOT NULL;