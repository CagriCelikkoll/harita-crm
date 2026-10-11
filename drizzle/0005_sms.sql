ALTER TABLE `ileti_ayarlari` ADD `sms_ret_numarasi` text;--> statement-breakpoint
ALTER TABLE `ileti_ayarlari` ADD `yetkili_telefonu` text;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `adres_ozeti` text;--> statement-breakpoint
CREATE INDEX `message_queue_adres_idx` ON `message_queue` (`tenant_id`,`adres_ozeti`);--> statement-breakpoint
ALTER TABLE `saglayici_ayarlari` ADD `webhook_ozeti` text;--> statement-breakpoint
CREATE UNIQUE INDEX `saglayici_webhook_uq` ON `saglayici_ayarlari` (`webhook_ozeti`);