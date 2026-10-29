ALTER TABLE `ileti_ayarlari` ADD `gunluk_whatsapp_api_siniri` integer;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `sablon_id` text;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `degisken_eslem` text;--> statement-breakpoint
ALTER TABLE `kampanyalar` ADD `duraklatma_nedeni` text;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `teslim_durumu` text;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `teslim_hata_kodu` integer;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `teslim_guncelleme` integer;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `ucret_kategorisi` text;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `ucretli` integer;--> statement-breakpoint
CREATE INDEX `message_queue_saglayici_idx` ON `message_queue` (`tenant_id`,`saglayici_kimligi`);--> statement-breakpoint
CREATE INDEX `message_queue_kanal_gonderim_idx` ON `message_queue` (`tenant_id`,`kanal`,`gonderim_tarihi`);