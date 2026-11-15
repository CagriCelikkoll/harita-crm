-- Çoklu WhatsApp numarası (plan-mesajlasma-v2 A1). npm run db:migrate ile uygulayın (önce yedek alınır; yabancı
-- anahtar denetimi src/server/db/migrasyon.ts'de kapatılıp COMMIT öncesi doğrulanır).
-- 1) whatsapp_baglantilari: birincil anahtar tenant_id → id; mevcut (çalışma alanı başına tek) satıra rastgele id ve
--    "Numara 1" adı verilir.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_whatsapp_baglantilari` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`ad` text NOT NULL,
	`sira` integer DEFAULT 0 NOT NULL,
	`webhook_kimligi` text NOT NULL,
	`waba_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`sifreli_veri` text NOT NULL,
	`test_modu` integer DEFAULT true NOT NULL,
	`uygulama_payi` integer DEFAULT 10 NOT NULL,
	`webhook_dogrulama_tarihi` integer,
	`son_imzali_durum_tarihi` integer,
	`numara_dogrulama_tarihi` integer,
	`gorunen_numara` text,
	`dogrulanmis_ad` text,
	`kalite` text,
	`limit_katmani` text,
	`son_kontrol` integer,
	`son_hata` text,
	`hesap_kilidi_kodu` integer,
	`hesap_kilidi_tarihi` integer,
	`sablon_senkron_tarihi` integer,
	`guncelleyen` text,
	`guncelleme_tarihi` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guncelleyen`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_whatsapp_baglantilari`("id", "tenant_id", "ad", "sira", "webhook_kimligi", "waba_id", "phone_number_id", "sifreli_veri", "test_modu", "uygulama_payi", "webhook_dogrulama_tarihi", "son_imzali_durum_tarihi", "numara_dogrulama_tarihi", "gorunen_numara", "dogrulanmis_ad", "kalite", "limit_katmani", "son_kontrol", "son_hata", "hesap_kilidi_kodu", "hesap_kilidi_tarihi", "sablon_senkron_tarihi", "guncelleyen", "guncelleme_tarihi") SELECT lower(hex(randomblob(16))), "tenant_id", 'Numara 1', 0, "webhook_kimligi", "waba_id", "phone_number_id", "sifreli_veri", "test_modu", "uygulama_payi", "webhook_dogrulama_tarihi", "son_imzali_durum_tarihi", "numara_dogrulama_tarihi", "gorunen_numara", "dogrulanmis_ad", "kalite", "limit_katmani", "son_kontrol", "son_hata", "hesap_kilidi_kodu", "hesap_kilidi_tarihi", "sablon_senkron_tarihi", "guncelleyen", "guncelleme_tarihi" FROM `whatsapp_baglantilari`;--> statement-breakpoint
DROP TABLE `whatsapp_baglantilari`;--> statement-breakpoint
ALTER TABLE `__new_whatsapp_baglantilari` RENAME TO `whatsapp_baglantilari`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_webhook_uq` ON `whatsapp_baglantilari` (`webhook_kimligi`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_numara_uq` ON `whatsapp_baglantilari` (`phone_number_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_tenant_id_uq` ON `whatsapp_baglantilari` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_baglantilari_ad_uq` ON `whatsapp_baglantilari` (`tenant_id`,`ad`);--> statement-breakpoint
-- 2) Şablonlar WABA'ya bağlanır: mevcut şablonlar çalışma alanının (tek) bağlantısının WABA'sına yazılır. Bağlantısı
--    olmayan alanın şablonu '' kalır (hiçbir numarada görünmez; bağlantı kurulunca senkron yeniden yazar).
DROP INDEX `whatsapp_sablonlari_uq`;--> statement-breakpoint
ALTER TABLE `whatsapp_sablonlari` ADD `waba_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `whatsapp_sablonlari` SET `waba_id` = coalesce((SELECT b.`waba_id` FROM `whatsapp_baglantilari` b WHERE b.`tenant_id` = `whatsapp_sablonlari`.`tenant_id` LIMIT 1), '');--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_sablonlari_uq` ON `whatsapp_sablonlari` (`tenant_id`,`waba_id`,`ad`,`dil`);--> statement-breakpoint
-- 3) WhatsApp kampanyaları gönderen numaraya bağlanır: mevcut kampanyalar çalışma alanının (tek) bağlantısına.
ALTER TABLE `kampanyalar` ADD `baglanti_id` text;--> statement-breakpoint
UPDATE `kampanyalar` SET `baglanti_id` = (SELECT b.`id` FROM `whatsapp_baglantilari` b WHERE b.`tenant_id` = `kampanyalar`.`tenant_id` LIMIT 1) WHERE `kanal` = 'whatsapp_api';
