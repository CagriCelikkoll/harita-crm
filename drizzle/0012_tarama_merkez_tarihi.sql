ALTER TABLE `scans` ADD `merkez_tarihi` integer;--> statement-breakpoint
-- Mevcut merkezler: süre taramanın oluşturulmasından sayılmaya devam eder.
UPDATE `scans` SET `merkez_tarihi` = `olusturma_tarihi` WHERE `merkez_lat` IS NOT NULL;