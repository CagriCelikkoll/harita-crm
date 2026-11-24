ALTER TABLE `whatsapp_kisileri` ADD `izin_kaydeden_id` text REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null;
