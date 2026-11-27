ALTER TABLE `ileti_ayarlari` ADD `otomatik_kapatma_gun` integer;--> statement-breakpoint
ALTER TABLE `memberships` ADD `gonderim_geri_al` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `sohbetler` ADD `teklif_istegi_tarihi` integer;