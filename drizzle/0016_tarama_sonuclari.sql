CREATE TABLE `tarama_sonuclari` (
	`tenant_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`lead_id` text NOT NULL,
	PRIMARY KEY(`scan_id`, `lead_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarama_sonuclari_tenant_scan_idx` ON `tarama_sonuclari` (`tenant_id`,`scan_id`);--> statement-breakpoint
-- Mevcut taramalar: kaydı ilk bulan tarama (leads.scan_id) eşleşmesi taşınır.
INSERT INTO `tarama_sonuclari` (`tenant_id`, `scan_id`, `lead_id`) SELECT `tenant_id`, `scan_id`, `id` FROM `leads` WHERE `scan_id` IS NOT NULL;
