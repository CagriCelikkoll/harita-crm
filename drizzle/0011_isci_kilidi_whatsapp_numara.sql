CREATE TABLE `isci_kilitleri` (
	`ad` text PRIMARY KEY NOT NULL,
	`sahip` text NOT NULL,
	`bitis` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `message_queue` ADD `kilit_sahibi` text;--> statement-breakpoint
ALTER TABLE `message_queue` ADD `gonderen_numara` text;--> statement-breakpoint
ALTER TABLE `whatsapp_baglantilari` ADD `numara_dogrulama_tarihi` integer;