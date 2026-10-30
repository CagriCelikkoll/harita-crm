CREATE TABLE `whatsapp_gelen_kimlikleri` (
	`tenant_id` text NOT NULL,
	`wamid` text NOT NULL,
	`tarih` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`tenant_id`, `wamid`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `whatsapp_gelen_tarih_idx` ON `whatsapp_gelen_kimlikleri` (`tarih`);