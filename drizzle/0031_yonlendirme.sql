ALTER TABLE `kampanyalar` ADD `tekil` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `kaynak_ayrintisi` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `yonlendiren_sohbet_id` text;