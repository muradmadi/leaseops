ALTER TABLE `apartments` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `apartments_archived_at_idx` ON `apartments` (`archived_at`);